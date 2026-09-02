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
      history: [],
      message: 'Hello',
      sessionId: 'session-1',
      triggerEventId: 'event-1',
      userId: 'user-1',
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

  it('rejects a terminal event with no model response', async () => {
    const client = createClient([streamResponse([
      'event: complete\ndata: {"type":"result","response":""}\n\n',
    ])]);
    const transport = createMobileSessionTransport({ apiBaseUrl: '/api', apiClient: client });

    await expect(transport.streamTextResponse({
      history: [],
      message: 'Hello',
      sessionId: 'session-1',
      triggerEventId: 'event-1',
      userId: 'user-1',
    })).rejects.toEqual(new MobileSessionStreamError('Musee returned an empty response.'));
  });
});
