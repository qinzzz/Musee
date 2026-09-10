import { describe, expect, it, vi } from 'vitest';

import type { ApiClient } from '@musee/client-core';

import {
  createMobileSessionTransport,
  MobileSessionHttpError,
  MobileSessionStreamError,
} from './mobileSessionTransport';

function createClient(responses: Response[]): ApiClient {
  return {
    fetchWithTimeout: vi.fn().mockImplementation(async () => {
      const response = responses.shift();
      if (!response) throw new Error('No response configured');
      return response;
    }),
    getAccessToken: vi.fn(),
    setAccessToken: vi.fn(),
    refreshAccessToken: vi.fn(),
  };
}

function streamResponse(parts: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    start(controller) {
      parts.forEach((part) => controller.enqueue(encoder.encode(part)));
      controller.close();
    },
  }));
}

describe('mobile session transport', () => {
  it('attaches an existing library artwork to a session', async () => {
    const client = createClient([Response.json({ inserted: 1, artworks: [] })]);
    const transport = createMobileSessionTransport({ apiBaseUrl: '/api', apiClient: client });

    await expect(transport.attachArtwork({
      artworkId: 'artwork-1',
      sessionId: 'session 1',
      userId: 'user 1',
    })).resolves.toBeUndefined();
    expect(client.fetchWithTimeout).toHaveBeenCalledWith(
      '/api/sessions/session%201/artworks?user_id=user%201',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ artwork_ids: ['artwork-1'] }),
      }),
    );
  });

  it('fetches the artworks linked to a session', async () => {
    const client = createClient([Response.json({
      items: [{
        id: 'artwork-1',
        photo_uri: 'https://images.example/artwork-1.jpg',
        thumbnail_uri: 'https://images.example/artwork-1-thumb.jpg',
        artwork_tags: [],
        analysis_status: 'analyzed',
      }],
    })]);
    const transport = createMobileSessionTransport({ apiBaseUrl: '/api', apiClient: client });

    await expect(transport.fetchArtworks('session 1', 'user 1')).resolves.toEqual([
      expect.objectContaining({ id: 'artwork-1' }),
    ]);
    expect(client.fetchWithTimeout).toHaveBeenCalledWith(
      '/api/sessions/session%201/artworks?user_id=user%201',
      { timeout: 10_000 },
    );
  });

  it('starts a session with the first user event', async () => {
    const client = createClient([Response.json({
      inserted: 1,
      session: { id: 'session-1', user_id: 'user-1', title: 'Color' },
    })]);
    const transport = createMobileSessionTransport({ apiBaseUrl: '/api', apiClient: client });

    await expect(transport.startTextSession({
      sessionId: 'session-1',
      userId: 'user-1',
      title: 'Color',
      event: {
        id: 'event-1',
        role: 'user',
        event_type: 'user_input',
        content: 'Tell me about color.',
      },
    })).resolves.toMatchObject({ id: 'session-1', title: 'Color' });
    expect(client.fetchWithTimeout).toHaveBeenCalledWith(
      '/api/sessions/start-with-event?user_id=user-1',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('starts a session around an artwork', async () => {
    const client = createClient([Response.json({
      inserted: 1,
      session: { id: 'session-1', user_id: 'user-1', title: 'New Session' },
      artworks: [],
    })]);
    const transport = createMobileSessionTransport({ apiBaseUrl: '/api', apiClient: client });

    await expect(transport.startArtworkSession({
      artworkId: 'artwork-1',
      sessionId: 'session-1',
      title: 'New Session',
      userId: 'user-1',
    })).resolves.toMatchObject({ id: 'session-1' });
    expect(client.fetchWithTimeout).toHaveBeenCalledWith(
      '/api/sessions/start-with-artworks?user_id=user-1',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          artwork_ids: ['artwork-1'],
          session_id: 'session-1',
          title: 'New Session',
        }),
      }),
    );
  });

  it('streams phases and chunks through a terminal result', async () => {
    const client = createClient([streamResponse([
      'event: phase\ndata: {"phase":"planning"}\n\n',
      'event: chunk\ndata: {"type":"text","content":"Hello "}\n\n',
      'event: chunk\ndata: {"type":"text","content":"there"}\n\n',
      'event: complete\ndata: {"type":"result","response":"Hello there"}\n\n',
    ])]);
    const transport = createMobileSessionTransport({ apiBaseUrl: '/api', apiClient: client });
    const onChunk = vi.fn();
    const onPhase = vi.fn();

    await expect(transport.streamTextResponse({
      sessionId: 'session-1',
      triggerEventId: 'event-1',
    }, { onChunk, onPhase })).resolves.toEqual({ response: 'Hello there' });
    expect(onPhase).toHaveBeenCalledWith('planning');
    expect(onChunk.mock.calls.flat()).toEqual(['Hello ', 'there']);
  });

  it('preserves structured policy errors', async () => {
    const transport = createMobileSessionTransport({
      apiBaseUrl: '/api',
      apiClient: createClient([Response.json({
        detail: {
          error_code: 'guest_quota_exhausted',
          requires_authentication: true,
        },
      }, { status: 429 })]),
    });

    await expect(transport.fetchSessions('user-1')).rejects.toEqual(
      new MobileSessionHttpError(429, 'guest_quota_exhausted', true),
    );
  });

  it('sends only canonical persisted turn identifiers', async () => {
    const client = createClient([streamResponse([
      'event: complete\ndata: {"type":"result","response":"Seen"}\n\n',
    ])]);
    const transport = createMobileSessionTransport({ apiBaseUrl: '/api', apiClient: client });

    await transport.streamTextResponse({
      sessionId: 'session-1',
      triggerEventId: 'event-1',
    });

    expect(client.fetchWithTimeout).toHaveBeenCalledWith(
      '/api/session/chat-stream',
      expect.objectContaining({
        body: JSON.stringify({
          session_id: 'session-1',
          trigger_event_id: 'event-1',
        }),
      }),
    );
  });

  it('rejects a terminal event with no model response', async () => {
    const client = createClient([streamResponse([
      'event: complete\ndata: {"type":"result","response":""}\n\n',
    ])]);
    const transport = createMobileSessionTransport({ apiBaseUrl: '/api', apiClient: client });

    await expect(transport.streamTextResponse({
      sessionId: 'session-1',
      triggerEventId: 'event-1',
    })).rejects.toEqual(new MobileSessionStreamError('Musee returned an empty response.'));
  });
});

it('cancels a waiting native stream without requiring AbortSignal.throwIfAborted', async () => {
  const { AbortController: NativeAbortController } = await import('abort-controller');
  const controller = new NativeAbortController();
  const cancel = vi.fn();
  const client = createClient([new Response(new ReadableStream({ cancel }))]);
  const transport = createMobileSessionTransport({ apiBaseUrl: '/api', apiClient: client });
  const onChunk = vi.fn();
  const result = transport.streamTextResponse({ sessionId: 'session', triggerEventId: 'input' }, {
    signal: controller.signal as unknown as AbortSignal, onChunk,
  });
  const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' });
  await vi.waitFor(() => expect(client.fetchWithTimeout).toHaveBeenCalled());
  controller.abort();
  await rejected;
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(onChunk).not.toHaveBeenCalled();
});

it('includes the pending response in the first-turn transaction', async () => {
  const client = createClient([Response.json({ session: { id: 'session' }, inserted: 2 })]);
  const transport = createMobileSessionTransport({ apiBaseUrl: '/api', apiClient: client });
  const event = { id: 'input', role: 'user' as const, event_type: 'user_input' as const, content: 'Question' };
  const pendingResponse = { id: 'response', role: 'model' as const, event_type: 'model_response' as const, trigger_event_id: 'input', payload: { status: 'pending' } };
  await transport.startTextSession({ event, pendingResponse, sessionId: 'session', title: 'Question', userId: 'user' });
  const options = vi.mocked(client.fetchWithTimeout).mock.calls[0][1];
  expect(JSON.parse(String(options?.body))).toEqual({ session_id: 'session', title: 'Question', event, pending_response: pendingResponse });
});
