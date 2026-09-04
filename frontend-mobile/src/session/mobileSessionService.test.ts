import { describe, expect, it, vi } from 'vitest';

import type { SessionEventRecord, SessionRecord } from '@musee/client-core';

import {
  createMobileSessionService,
  restoreTextSessionAttempt,
} from './mobileSessionService';
import {
  MobileSessionHttpError,
  type MobileSessionTransport,
} from './mobileSessionTransport';

const SESSION: SessionRecord = {
  id: 'session-1',
  user_id: 'user-1',
  title: 'Tell me about color',
};

function createTransport(): MobileSessionTransport {
  return {
    appendEvents: vi.fn().mockResolvedValue(undefined),
    fetchArtworks: vi.fn().mockResolvedValue([]),
    fetchEvents: vi.fn().mockResolvedValue([]),
    fetchSessions: vi.fn().mockResolvedValue([SESSION]),
    startArtworkSession: vi.fn().mockResolvedValue(SESSION),
    startTextSession: vi.fn().mockResolvedValue(SESSION),
    streamTextResponse: vi.fn().mockResolvedValue({ response: 'Color shapes perception.' }),
    updateEvent: vi.fn().mockImplementation(async (_sessionId, _eventId, event) => event),
  };
}

describe('mobile session service', () => {
  it('creates stable correlated events for an optimistic text turn', () => {
    const ids = ['session-1', 'user-1', 'model-1'];
    const service = createMobileSessionService({
      createId: () => ids.shift()!,
      now: () => new Date('2026-09-02T10:00:00Z'),
      transport: createTransport(),
    });

    const attempt = service.createTextAttempt('account-1', '  Tell me about color  ');

    expect(attempt).toMatchObject({
      sessionId: 'session-1',
      text: 'Tell me about color',
      userEvent: { id: 'user-1', event_type: 'user_input' },
      responseEvent: {
        id: 'model-1',
        event_type: 'model_response',
        trigger_event_id: 'user-1',
        payload: { status: 'pending' },
      },
    });
  });

  it('atomically creates a new session with its first user event', async () => {
    const transport = createTransport();
    const service = createMobileSessionService({ transport });
    const attempt = service.createTextAttempt('user-1', 'A first question', 'session-1');

    await expect(service.persistUserInput(attempt, null)).resolves.toBe(SESSION);
    expect(transport.startTextSession).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'session-1',
      userId: 'user-1',
      event: expect.objectContaining({ event_type: 'user_input' }),
    }));
    expect(transport.appendEvents).not.toHaveBeenCalled();
  });

  it('creates an artwork-bearing input without fabricating user text', () => {
    const ids = ['user-event', 'model-event'];
    const service = createMobileSessionService({
      createId: () => ids.shift()!,
      now: () => new Date('2026-09-02T10:00:00Z'),
      transport: createTransport(),
    });

    const attempt = service.createArtworkAttempt(
      'user-1',
      'artwork-1',
      'capture',
      '   ',
      'session-1',
    );

    expect(attempt).toMatchObject({
      text: '',
      userEvent: {
        id: 'user-event',
        content: null,
        artwork_ids: ['artwork-1'],
        payload: { artworks: [{ artwork_id: 'artwork-1', source: 'capture' }] },
      },
      responseEvent: {
        id: 'model-event',
        artwork_ids: ['artwork-1'],
        trigger_event_id: 'user-event',
      },
    });
  });

  it('starts a new session around an uploaded artwork', async () => {
    const transport = createTransport();
    const service = createMobileSessionService({ transport });

    await expect(service.startArtworkSession(
      'user-1',
      'artwork-1',
      'session-1',
      'New Session',
    )).resolves.toBe(SESSION);
    expect(transport.startArtworkSession).toHaveBeenCalledWith({
      artworkId: 'artwork-1',
      sessionId: 'session-1',
      title: 'New Session',
      userId: 'user-1',
    });
  });

  it('streams using the persisted turn identifiers', async () => {
    const transport = createTransport();
    const service = createMobileSessionService({ transport });
    const attempt = service.createTextAttempt('user-1', 'Current question', 'session-1');
    await service.streamResponse(attempt);

    expect(transport.streamTextResponse).toHaveBeenCalledWith(
      { sessionId: 'session-1', triggerEventId: attempt.userEvent.id },
      undefined,
    );
  });

  it('does not send artwork context that the backend can resolve', async () => {
    const transport = createTransport();
    const service = createMobileSessionService({ transport });
    const attempt = service.createArtworkAttempt(
      'user-1',
      'new-artwork',
      'upload',
      '',
      'session-1',
    );
    await service.streamResponse(attempt);

    expect(transport.streamTextResponse).toHaveBeenCalledWith(
      { sessionId: 'session-1', triggerEventId: attempt.userEvent.id },
      undefined,
    );
  });

  it('falls back to an idempotent append when a response update is unavailable', async () => {
    const transport = createTransport();
    vi.mocked(transport.updateEvent).mockRejectedValue(new MobileSessionHttpError(404));
    const service = createMobileSessionService({ transport });
    const attempt = service.createTextAttempt('user-1', 'Question', 'session-1');

    await service.persistResponse(attempt, 'completed', { response: 'Answer' });

    expect(transport.appendEvents).toHaveBeenCalledWith('session-1', [
      expect.objectContaining({
        id: attempt.responseEvent.id,
        content: 'Answer',
        payload: { status: 'completed' },
      }),
    ]);
  });

  it('resets an existing failed response before retrying its original turn', async () => {
    const transport = createTransport();
    const service = createMobileSessionService({ transport });
    const attempt = service.createTextAttempt('user-1', 'Question', 'session-1');

    await service.persistPendingResponse(attempt, true);

    expect(transport.updateEvent).toHaveBeenCalledWith(
      'session-1',
      attempt.responseEvent.id,
      expect.objectContaining({ payload: { status: 'pending' } }),
    );
    expect(transport.appendEvents).not.toHaveBeenCalled();
  });

  it('reconstructs a retry from a persisted response and its trigger', () => {
    const userEvent: SessionEventRecord = {
      id: 'user-event',
      role: 'user',
      event_type: 'user_input',
      content: 'Original question',
    };
    const responseEvent: SessionEventRecord = {
      id: 'response-event',
      role: 'model',
      event_type: 'model_response',
      content: '',
      trigger_event_id: userEvent.id,
      payload: { status: 'failed' },
    };

    expect(restoreTextSessionAttempt(
      responseEvent,
      [userEvent, responseEvent],
      SESSION,
      'user-1',
    )).toMatchObject({
      text: 'Original question',
      responseEvent: { id: 'response-event', payload: { status: 'pending' } },
    });
  });

  it('reconstructs an artwork-only turn without fabricated text', () => {
    const userEvent: SessionEventRecord = {
      id: 'user-event',
      role: 'user',
      event_type: 'user_input',
      content: null,
      artwork_ids: ['artwork-1'],
    };
    const responseEvent: SessionEventRecord = {
      id: 'response-event',
      role: 'model',
      event_type: 'model_response',
      content: '',
      artwork_ids: ['artwork-1'],
      trigger_event_id: userEvent.id,
      payload: { status: 'failed' },
    };

    expect(restoreTextSessionAttempt(
      responseEvent,
      [userEvent, responseEvent],
      SESSION,
      'user-1',
    )).toMatchObject({ text: '' });
  });
});
