import type { SessionEventRecord } from '@musee/client-core';

export const ORPHANED_RESPONSE_MESSAGE = 'This response was interrupted. Try it again.';
const AUTH_REQUIRED_RESPONSE_MESSAGE = 'Sign in to continue this response.';
const ARTWORK_RESULT_FAILED_MESSAGE = 'Musee could not process this artwork.';
const FAILURE_MESSAGE_KINDS = new Set([
  'analysis_failure',
  'session_failure',
  'upload_failure',
]);

export type SessionEventTextPresentation = {
  kind: 'failure' | 'model' | 'status' | 'user';
  retryable: boolean;
  streaming: boolean;
  text: string;
};

function eventContent(event: SessionEventRecord): string {
  return event.content?.trim() || '';
}

function eventError(event: SessionEventRecord, fallback: string): string {
  const errorMessage = event.payload?.error_message;
  return typeof errorMessage === 'string' && errorMessage.trim()
    ? errorMessage.trim()
    : fallback;
}

export function getSessionEventTextPresentation(
  event: SessionEventRecord,
): SessionEventTextPresentation | null {
  const content = eventContent(event);

  if (event.event_type === 'user_input') {
    return content
      ? { kind: 'user', retryable: false, streaming: false, text: content }
      : null;
  }

  if (event.event_type === 'model_response') {
    const status = event.payload?.status;
    if (status === 'failed') {
      return {
        kind: 'failure',
        retryable: true,
        streaming: false,
        text: eventError(event, ORPHANED_RESPONSE_MESSAGE),
      };
    }
    if (status === 'auth_required') {
      return {
        kind: 'failure',
        retryable: true,
        streaming: false,
        text: eventError(event, AUTH_REQUIRED_RESPONSE_MESSAGE),
      };
    }
    return content
      ? {
          kind: 'model',
          retryable: false,
          streaming: status === 'pending',
          text: content,
        }
      : null;
  }

  if (event.event_type === 'artwork_result') {
    return event.payload?.outcome === 'failed'
      ? {
          kind: 'failure',
          retryable: false,
          streaming: false,
          text: eventError(event, ARTWORK_RESULT_FAILED_MESSAGE),
        }
      : null;
  }

  if (event.event_type !== 'message' || !content) return null;
  const messageKind = event.payload?.message_kind;
  if (typeof messageKind === 'string' && FAILURE_MESSAGE_KINDS.has(messageKind)) {
    return {
      kind: 'failure',
      retryable: false,
      streaming: false,
      text: content,
    };
  }
  if (event.role === 'user') {
    return { kind: 'user', retryable: false, streaming: false, text: content };
  }
  if (event.role === 'model') {
    return { kind: 'model', retryable: false, streaming: false, text: content };
  }
  return { kind: 'status', retryable: false, streaming: false, text: content };
}

export function toPendingSessionResponse(
  event: SessionEventRecord,
): SessionEventRecord {
  return {
    ...event,
    content: '',
    payload: { status: 'pending' },
  };
}

export function toFailedSessionResponse(
  event: SessionEventRecord,
  message: string,
): SessionEventRecord {
  return {
    ...event,
    content: '',
    payload: { status: 'failed', error_message: message },
  };
}

export function replaceSessionEvent(
  events: SessionEventRecord[],
  replacement: SessionEventRecord,
): SessionEventRecord[] {
  const index = events.findIndex((event) => event.id === replacement.id);
  if (index < 0) return [...events, replacement];
  return events.map((event, eventIndex) => (
    eventIndex === index ? replacement : event
  ));
}

export function updateSessionEvent(
  events: SessionEventRecord[],
  eventId: string,
  update: (event: SessionEventRecord) => SessionEventRecord,
): SessionEventRecord[] {
  return events.map((event) => (event.id === eventId ? update(event) : event));
}

export function markOrphanedResponses(
  events: SessionEventRecord[],
): { events: SessionEventRecord[]; orphaned: SessionEventRecord[] } {
  const orphaned: SessionEventRecord[] = [];
  const normalized = events.map((event) => {
    if (
      event.event_type !== 'model_response'
      || event.payload?.status !== 'pending'
    ) {
      return event;
    }
    const failed = toFailedSessionResponse(event, ORPHANED_RESPONSE_MESSAGE);
    orphaned.push(failed);
    return failed;
  });
  return { events: normalized, orphaned };
}
