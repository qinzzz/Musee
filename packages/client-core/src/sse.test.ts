import { describe, expect, it } from 'vitest';

import { createSseParser } from './sse';

describe('SSE parser', () => {
  it('preserves an event split across transport chunks', () => {
    const parser = createSseParser();

    expect(parser.push('event: chu')).toEqual([]);
    expect(parser.push('nk\ndata: {"content":"hello"}\n\n')).toEqual([
      { event: 'chunk', data: '{"content":"hello"}' },
    ]);
  });

  it('supports CRLF, comments, and multiline data fields', () => {
    const parser = createSseParser();

    expect(parser.push(
      ': keepalive\r\nevent: complete\r\ndata: first\r\ndata: second\r\n\r\n',
    )).toEqual([{ event: 'complete', data: 'first\nsecond' }]);
  });

  it('does not invent an event boundary when CRLF is split across chunks', () => {
    const parser = createSseParser();

    expect(parser.push('event: chunk\r')).toEqual([]);
    expect(parser.push('\ndata: value\r')).toEqual([]);
    expect(parser.push('\n\r\n')).toEqual([{ event: 'chunk', data: 'value' }]);
  });

  it('flushes a final event when the stream omits the trailing separator', () => {
    const parser = createSseParser();

    parser.push('data: done');
    expect(parser.finish()).toEqual([{ event: 'message', data: 'done' }]);
  });
});
