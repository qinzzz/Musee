import type { Message } from '../types';
import { API_BASE_URL, API_TIMEOUT, fetchWithTimeout, getLanguage } from './core';

export const SESSION_STREAM_IDLE_TIMEOUT_MS = 60_000;

export type SessionChatPhase = 'planning' | 'retrieving_collection' | 'generating_response';

export type SessionRetrievalTrace = {
  status: 'skipped' | 'completed' | 'empty' | 'failed';
  strategy?: 'structured' | 'conceptual_rerank' | 'hybrid' | null;
  eligible_count?: number;
  candidate_count?: number;
  selected_count?: number;
  candidates_truncated?: boolean;
  completeness?: 'complete' | 'bounded' | 'unknown';
  total_count?: number | null;
  skip_reason?: 'planner_not_needed' | 'unauthenticated' | 'feature_disabled' | null;
  selected_source_ids?: string[];
  failure_stage?: string | null;
};

export type SessionChatHistoryMessage = Message & {
  retrieval_source_ids?: string[];
};

export class SessionAuthenticationError extends Error {
  readonly code: 'token_expired' | 'invalid_token' | 'authentication_required';

  constructor(code: SessionAuthenticationError['code'], message: string) {
    super(message);
    this.name = 'SessionAuthenticationError';
    this.code = code;
  }
}

export class SessionGuestLimitError extends Error {
  readonly code = 'guest_quota_exhausted';

  constructor(message: string) {
    super(message);
    this.name = 'SessionGuestLimitError';
  }
}

async function buildSessionChatError(response: Response): Promise<Error> {
  const fallback = `session chat stream failed: ${response.status}`;
  const text = await response.text();

  try {
    const body = JSON.parse(text) as { detail?: string | { error_code?: string; message?: string } };
    const detail = body.detail;
    if (typeof detail === 'object' && detail?.error_code === 'guest_quota_exhausted') {
      return new SessionGuestLimitError(detail.message || 'The guest preview has reached its limit.');
    }
    if (response.status !== 401) return new Error(text || fallback);
    const code = typeof detail === 'object' && detail?.error_code === 'token_expired'
      ? 'token_expired'
      : typeof detail === 'object' && detail?.error_code === 'invalid_token'
        ? 'invalid_token'
        : 'authentication_required';
    return new SessionAuthenticationError(
      code,
      typeof detail === 'object' && detail?.message
        ? detail.message
        : 'Please sign in again.',
    );
  } catch {
    if (response.status !== 401) return new Error(text || fallback);
    return new SessionAuthenticationError('authentication_required', 'Please sign in again.');
  }
}

async function readStreamWithIdleTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error('Session response stream timed out'));
        }, SESSION_STREAM_IDLE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

export interface CommunityData {
  entity: { id: string; display_artist: string; display_title: string; instance_count: number } | null;
  comments: Array<{
    id: string;
    entity_id: string;
    user_id: string;
    author_name: string;
    author_avatar?: string;
    text: string;
    created_at: string;
  }>;
}

export async function streamSessionChat(
  items: { id: string; url: string; keywords: string[]; artistName?: string; artworkName?: string; description?: string; date?: string; medium?: string }[],
  conversationHistory: SessionChatHistoryMessage[],
  newMessage: string,
  onChunk: (text: string) => void,
  onComplete: (response: string, retrieval?: SessionRetrievalTrace) => void,
  onError: (error: Error) => void,
  context?: {
    userId?: string;
    sessionId?: string;
    triggerEventId?: string;
    onPhase?: (phase: SessionChatPhase) => void;
  },
): Promise<void> {
  const history = conversationHistory.map((message) => ({
    role: message.role === 'model' ? 'assistant' : message.role,
    content: message.text,
    ...(message.retrieval_source_ids?.length
      ? { retrieval_source_ids: message.retrieval_source_ids }
      : {}),
  }));

  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let terminalEventReceived = false;

  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/visit/chat-stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: items.map((item) => ({
          id: item.id,
          url: item.url,
          keywords: item.keywords,
          artist_name: item.artistName,
          artwork_name: item.artworkName,
          description: item.description,
          date: item.date,
          medium: item.medium,
        })),
        conversation_history: history,
        new_message: newMessage,
        user_id: context?.userId,
        session_id: context?.sessionId,
        trigger_event_id: context?.triggerEventId,
      }),
      timeout: API_TIMEOUT,
    });

    if (!response.ok) {
      throw await buildSessionChatError(response);
    }

    reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body is not readable');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    while (!terminalEventReceived) {
      const { done, value } = await readStreamWithIdleTimeout(reader);
      if (done) {
        throw new Error('Session response stream ended before completion');
      }
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() || '';
      for (const event of events) {
        if (!event.trim()) continue;
        const lines = event.split('\n');
        let eventType = '';
        let eventData = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) eventType = line.slice(7);
          else if (line.startsWith('data: ')) eventData = line.slice(6);
        }
        if (!eventData) continue;
        try {
          const data = JSON.parse(eventData);
          if (eventType === 'phase' && typeof data.phase === 'string') {
            context?.onPhase?.(data.phase as SessionChatPhase);
          } else if (eventType === 'chunk' && data.type === 'text') {
            onChunk(data.content);
          } else if (eventType === 'complete' && data.type === 'result') {
            terminalEventReceived = true;
            onComplete(data.response || '', data.retrieval);
          } else if (eventType === 'error') {
            throw new Error(data.message || 'Stream error');
          }
        } catch {
          if (eventType === 'error') {
            throw new Error(eventData);
          }
        }
      }
    }
  } catch (error) {
    if (!terminalEventReceived) {
      terminalEventReceived = true;
      onError(error instanceof Error ? error : new Error(String(error)));
    }
  } finally {
    if (reader) {
      try {
        await reader.cancel();
      } catch {
        // The stream may already be closed or errored.
      }
    }
  }
}

export async function getTagExplanation(tag: string, artworkId?: string): Promise<string> {
  const params = new URLSearchParams({ tag });
  if (artworkId) params.append('artwork_id', artworkId);
  const lang = getLanguage();
  if (lang) params.append('language', lang);

  const response = await fetchWithTimeout(`${API_BASE_URL}/tag-explanation?${params.toString()}`);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error (${response.status}): ${errorText}`);
  }
  return response.text();
}

export async function fetchCommunity(artworkId: string): Promise<CommunityData> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/artworks/${artworkId}/community`);
  if (!response.ok) throw new Error(`API error (${response.status})`);
  return response.json();
}

export async function publishComment(artworkId: string, userId: string, text: string): Promise<any> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/artworks/${artworkId}/community/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, text }),
  });
  if (!response.ok) throw new Error(`API error (${response.status})`);
  return response.json();
}

export async function deleteCommunityComment(artworkId: string, commentId: string, userId: string): Promise<void> {
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/artworks/${artworkId}/community/comments/${commentId}?user_id=${encodeURIComponent(userId)}`,
    { method: 'DELETE' },
  );
  if (!response.ok) throw new Error(`API error (${response.status})`);
}
