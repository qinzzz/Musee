import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SESSION_STREAM_IDLE_TIMEOUT_MS,
  SessionAuthenticationError,
  SessionGuestLimitError,
  streamSessionChat,
} from './chat';

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

  it('forwards retrieval phases and completion provenance', async () => {
    const onPhase = vi.fn();
    const retrieval = { status: 'completed', selected_source_ids: ['artwork-1'] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(createStreamResponse([
      'event: phase\ndata: {"phase":"retrieving_collection"}\n\n',
      `event: complete\ndata: ${JSON.stringify({ type: 'result', response: 'Found it', retrieval })}\n\n`,
    ])));
    const onComplete = vi.fn();

    await streamSessionChat([], [], 'Search mine', vi.fn(), onComplete, vi.fn(), { onPhase });

    expect(onPhase).toHaveBeenCalledWith('retrieving_collection');
    expect(onComplete).toHaveBeenCalledWith('Found it', retrieval);
  });

  it('forwards prior retrieval source IDs for follow-up reference resolution', async () => {
    const fetchMock = vi.fn().mockResolvedValue(createStreamResponse([
      'event: complete\ndata: {"type":"result","response":"Done"}\n\n',
    ]));
    vi.stubGlobal('fetch', fetchMock);

    await streamSessionChat(
      [],
      [{ role: 'model', text: 'You saved Woman with a Hat.', retrieval_source_ids: ['saved-art-1'] }],
      'When and where did I find this?',
      vi.fn(),
      vi.fn(),
      vi.fn(),
    );

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body.conversation_history).toEqual([{
      role: 'assistant',
      content: 'You saved Woman with a Hat.',
      retrieval_source_ids: ['saved-art-1'],
    }]);
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

  it('returns a typed authentication error for an expired token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      detail: { error_code: 'token_expired', message: 'Your session expired. Please sign in again.' },
    }), { status: 401 })));
    const stream = startStream();

    await stream.promise;

    expect(stream.onError).toHaveBeenCalledOnce();
    expect(stream.onError.mock.calls[0][0]).toBeInstanceOf(SessionAuthenticationError);
    expect(stream.onError.mock.calls[0][0]).toMatchObject({ code: 'token_expired' });
  });

  it('returns a typed guest-limit error for an exhausted preview', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      detail: { error_code: 'guest_quota_exhausted', message: 'Guest limit reached.' },
    }), { status: 429 })));
    const stream = startStream();

    await stream.promise;

    expect(stream.onError).toHaveBeenCalledOnce();
    expect(stream.onError.mock.calls[0][0]).toBeInstanceOf(SessionGuestLimitError);
    expect(stream.onError.mock.calls[0][0]).toMatchObject({ code: 'guest_quota_exhausted' });
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
