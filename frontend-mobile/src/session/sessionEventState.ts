import type { SessionEventRecord } from '@musee/client-core';

export const ORPHANED_RESPONSE_MESSAGE = 'This response was interrupted. Try it again.';

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
