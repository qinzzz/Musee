import type { SseMessage } from './sse';

export type SessionRole = 'model' | 'system' | 'user';
export type SessionEventType =
  | 'artwork_result'
  | 'message'
  | 'model_response'
  | 'user_input';
export type SessionResponseStatus = 'auth_required' | 'completed' | 'failed' | 'pending';
export type SessionChatPhase = 'generating_response' | 'planning' | 'retrieving_collection';

export type SessionRecord = {
  id: string;
  user_id: string;
  title: string;
  user_title?: string | null;
  system_title?: string | null;
  title_state?: 'auto' | 'draft' | 'user_locked';
  narrative_summary?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type SessionEventRecord = {
  id: string;
  session_id?: string;
  role: SessionRole;
  type?: string;
  event_type: SessionEventType;
  content?: string | null;
  artwork_id?: string | null;
  artwork_ids?: string[];
  trigger_event_id?: string | null;
  payload?: Record<string, unknown> | null;
  sequence_number?: number;
  created_at?: string | null;
};

export type SessionChatStreamEvent =
  | { type: 'chunk'; content: string }
  | { type: 'complete'; response: string; retrieval?: Record<string, unknown> }
  | { type: 'error'; message: string }
  | { type: 'phase'; phase: SessionChatPhase };

const CHAT_PHASES = new Set<SessionChatPhase>([
  'generating_response',
  'planning',
  'retrieving_collection',
]);
const MAX_INITIAL_SESSION_TITLE_LENGTH = 60;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function buildInitialSessionTitle(message: string, fallback = 'New Session'): string {
  const normalized = message.replace(/\s+/g, ' ').trim();
  if (!normalized) return fallback;
  return normalized.length <= MAX_INITIAL_SESSION_TITLE_LENGTH
    ? normalized
    : normalized.slice(0, MAX_INITIAL_SESSION_TITLE_LENGTH).trimEnd();
}

export function parseSessionChatStreamEvent(
  message: SseMessage,
): SessionChatStreamEvent | null {
  let data: unknown;
  try {
    data = JSON.parse(message.data);
  } catch {
    return null;
  }
  if (!isObject(data)) return null;

  if (message.event === 'phase') {
    const phase = stringValue(data.phase) as SessionChatPhase;
    return CHAT_PHASES.has(phase) ? { type: 'phase', phase } : null;
  }
  if (message.event === 'chunk' && data.type === 'text') {
    const content = stringValue(data.content);
    return content ? { type: 'chunk', content } : null;
  }
  if (message.event === 'complete' && data.type === 'result') {
    const response = stringValue(data.response);
    return {
      type: 'complete',
      response,
      ...(isObject(data.retrieval) ? { retrieval: data.retrieval } : {}),
    };
  }
  if (message.event === 'error') {
    return {
      type: 'error',
      message: stringValue(data.message) || 'Musee could not complete this response.',
    };
  }
  return null;
}
