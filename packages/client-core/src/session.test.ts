import { describe, expect, it } from 'vitest';

import {
  buildInitialSessionTitle,
  parseSessionChatStreamEvent,
} from './session';

describe('session core', () => {
  it('builds a stable initial title from the first message', () => {
    expect(buildInitialSessionTitle('  A   question about color  ')).toBe(
      'A question about color',
    );
    expect(buildInitialSessionTitle('x'.repeat(80))).toHaveLength(60);
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
