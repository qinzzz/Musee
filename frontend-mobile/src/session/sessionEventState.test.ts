import { describe, expect, it } from 'vitest';

import type { SessionEventRecord } from '@musee/client-core';

import {
  getSessionEventTextPresentation,
  markOrphanedResponses,
  replaceSessionEvent,
} from './sessionEventState';

const PENDING: SessionEventRecord = {
  id: 'response-1',
  role: 'model',
  event_type: 'model_response',
  content: 'partial',
  payload: { status: 'pending' },
  trigger_event_id: 'user-1',
};

describe('session event state', () => {
  it('marks restored pending responses as interrupted', () => {
    const result = markOrphanedResponses([PENDING]);

    expect(result.events[0]).toMatchObject({
      content: '',
      payload: { status: 'failed' },
    });
    expect(result.orphaned).toHaveLength(1);
  });

  it('replaces an optimistic event without changing its position', () => {
    const replacement = { ...PENDING, content: 'Done', payload: { status: 'completed' } };
    expect(replaceSessionEvent([
      { ...PENDING, id: 'user-1', role: 'user', event_type: 'user_input' },
      PENDING,
    ], replacement)[1]).toBe(replacement);
  });

  it('presents canonical model and system messages', () => {
    expect(getSessionEventTextPresentation({
      id: 'model-message',
      role: 'model',
      event_type: 'message',
      content: 'A restored legacy response.',
    })).toMatchObject({ kind: 'model', text: 'A restored legacy response.' });

    expect(getSessionEventTextPresentation({
      id: 'system-message',
      role: 'system',
      event_type: 'message',
      content: 'Upload failed.',
      payload: { message_kind: 'upload_failure' },
    })).toMatchObject({ kind: 'failure', text: 'Upload failed.' });
  });

  it('makes persisted authentication responses visible and retryable', () => {
    expect(getSessionEventTextPresentation({
      ...PENDING,
      payload: { status: 'auth_required' },
    })).toEqual({
      kind: 'failure',
      retryable: true,
      streaming: false,
      text: 'Sign in to continue this response.',
    });
  });

  it('surfaces artwork result failures without duplicating successful result text', () => {
    expect(getSessionEventTextPresentation({
      id: 'failed-artwork',
      role: 'model',
      event_type: 'artwork_result',
      payload: { outcome: 'failed', error_message: 'The image could not be analyzed.' },
    })).toMatchObject({
      kind: 'failure',
      retryable: false,
      text: 'The image could not be analyzed.',
    });
    expect(getSessionEventTextPresentation({
      id: 'successful-artwork',
      role: 'model',
      event_type: 'artwork_result',
      payload: { outcome: 'succeeded' },
    })).toBeNull();
  });
});
