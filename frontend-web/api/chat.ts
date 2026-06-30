import type { Message } from '../types';
import { API_BASE_URL, API_TIMEOUT, fetchWithTimeout, getLanguage } from './core';

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
  conversationHistory: Message[],
  newMessage: string,
  onChunk: (text: string) => void,
  onComplete: (response: string) => void,
  onError: (error: Error) => void,
): Promise<void> {
  const history = conversationHistory.map((message) => ({
    role: message.role === 'model' ? 'assistant' : message.role,
    content: message.text,
  }));

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
      }),
      timeout: API_TIMEOUT,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `session chat stream failed: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body is not readable');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
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
          if (eventType === 'chunk' && data.type === 'text') {
            onChunk(data.content);
          } else if (eventType === 'complete' && data.type === 'result') {
            onComplete(data.response || '');
          } else if (eventType === 'error') {
            onError(new Error(data.message || 'Stream error'));
          }
        } catch {
          if (eventType === 'error') {
            onError(new Error(eventData));
          }
        }
      }
    }
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)));
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
