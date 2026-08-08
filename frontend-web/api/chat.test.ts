import { afterEach, describe, expect, it, vi } from 'vitest';
import { SESSION_STREAM_IDLE_TIMEOUT_MS, streamSessionChat } from './chat';

const encoder = new TextEncoder();

function createStreamResponse(chunks: string[], close = true): Response {
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      if (close) controller.close();
    },
  }), { status: 200 });
}

function startStream(
  onChunk = vi.fn(),
  onComplete = vi.fn(),
  onError = vi.fn(),
) {
  const promise = streamSessionChat(
    [],
    [],
    'Tell me about this',
    onChunk,
    onComplete,
    onError,
  );
  return { promise, onChunk, onComplete, onError };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('streamSessionChat', () => {
  it('completes only after a terminal complete event', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(createStreamResponse([
      'event: chunk\ndata: {"type":"text","content":"Hello"}\n\n',
      'event: complete\ndata: {"type":"result","response":"Hello"}\n\n',
    ])));
    const stream = startStream();

    await stream.promise;

    expect(stream.onChunk).toHaveBeenCalledWith('Hello');
    expect(stream.onComplete).toHaveBeenCalledOnce();
    expect(stream.onError).not.toHaveBeenCalled();
  });

  it('fails when the body ends without a complete or error event', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(createStreamResponse([
      'event: chunk\ndata: {"type":"text","content":"Partial"}\n\n',
    ])));
    const stream = startStream();

    await stream.promise;

    expect(stream.onChunk).toHaveBeenCalledWith('Partial');
    expect(stream.onComplete).not.toHaveBeenCalled();
    expect(stream.onError).toHaveBeenCalledOnce();
    expect(stream.onError.mock.calls[0][0].message).toContain('ended before completion');
  });

  it('forwards an SSE error exactly once', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(createStreamResponse([
      'event: error\ndata: {"message":"provider unavailable"}\n\n',
    ])));
    const stream = startStream();

    await stream.promise;

    expect(stream.onComplete).not.toHaveBeenCalled();
    expect(stream.onError).toHaveBeenCalledOnce();
  });

  it('fails an open stream after a period with no data', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(createStreamResponse([], false)));
    const stream = startStream();

    await vi.advanceTimersByTimeAsync(SESSION_STREAM_IDLE_TIMEOUT_MS);
    await stream.promise;

    expect(stream.onComplete).not.toHaveBeenCalled();
    expect(stream.onError).toHaveBeenCalledOnce();
    expect(stream.onError.mock.calls[0][0].message).toContain('timed out');
  });
});
