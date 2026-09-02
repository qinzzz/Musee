import { describe, expect, it } from 'vitest';

import type { SessionEventRecord } from '@musee/client-core';

import { markOrphanedResponses, replaceSessionEvent } from './sessionEventState';

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
});
