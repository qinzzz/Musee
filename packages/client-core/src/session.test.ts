import { describe, expect, it } from 'vitest';

import {
  buildInitialSessionTitle,
  parseSessionChatStreamEvent,
  serializeTextSessionHistory,
  type SessionEventRecord,
} from './session';

const EVENTS: SessionEventRecord[] = [
  {
    id: 'user-1',
    role: 'user',
    event_type: 'user_input',
    content: 'Tell me about abstraction.',
  },
  {
    id: 'model-1',
    role: 'model',
    event_type: 'model_response',
    content: 'Abstraction moves away from literal depiction.',
    payload: {
      status: 'completed',
      retrieval: { selected_source_ids: ['art-1'] },
    },
  },
  {
    id: 'user-2',
    role: 'user',
    event_type: 'user_input',
    content: 'What should I notice first?',
  },
];

describe('session core', () => {
  it('builds a stable initial title from the first message', () => {
    expect(buildInitialSessionTitle('  A   question about color  ')).toBe(
      'A question about color',
    );
    expect(buildInitialSessionTitle('x'.repeat(80))).toHaveLength(60);
  });

  it('serializes only history before the current trigger', () => {
    expect(serializeTextSessionHistory(EVENTS, 'user-2')).toEqual([
      { role: 'user', content: 'Tell me about abstraction.' },
      {
        role: 'assistant',
        content: 'Abstraction moves away from literal depiction.',
        retrieval_source_ids: ['art-1'],
      },
    ]);
  });

  it('omits pending and failed model responses from prompt history', () => {
    expect(serializeTextSessionHistory([
      { ...EVENTS[1], payload: { status: 'pending' } },
      { ...EVENTS[1], id: 'model-2', payload: { status: 'failed' } },
    ])).toEqual([]);
  });

  it('parses phase, chunk, completion, and error SSE events', () => {
    expect(parseSessionChatStreamEvent({
      event: 'phase',
      data: '{"phase":"planning"}',
    })).toEqual({ type: 'phase', phase: 'planning' });
    expect(parseSessionChatStreamEvent({
      event: 'chunk',
      data: '{"type":"text","content":"Hello"}',
    })).toEqual({ type: 'chunk', content: 'Hello' });
    expect(parseSessionChatStreamEvent({
      event: 'complete',
      data: '{"type":"result","response":"Done","retrieval":{"status":"skipped"}}',
    })).toEqual({
      type: 'complete',
      response: 'Done',
      retrieval: { status: 'skipped' },
    });
    expect(parseSessionChatStreamEvent({
      event: 'error',
      data: '{"message":"provider unavailable"}',
    })).toEqual({ type: 'error', message: 'provider unavailable' });
  });
});
