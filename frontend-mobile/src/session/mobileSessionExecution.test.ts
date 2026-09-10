import { describe, expect, it, vi } from 'vitest';
import { createMobileSessionExecution } from './mobileSessionExecution';
import { createMobileSessionService } from './mobileSessionService';
import type { StreamTextSessionCallbacks } from './mobileSessionTransport';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const session = { id: 'saved', user_id: 'account', title: 'Question' };
function setup() {
  let id = 0;
  const transport = {
    attachArtwork: vi.fn(), appendEvents: vi.fn().mockResolvedValue(undefined),
    fetchArtworks: vi.fn(), fetchEvents: vi.fn(), fetchSessions: vi.fn(), fetchSession: vi.fn(),
    startArtworkSession: vi.fn(), startTextSession: vi.fn().mockResolvedValue(session),
    streamTextResponse: vi.fn().mockResolvedValue({ response: 'Answer' }),
    updateEvent: vi.fn().mockImplementation(async (_session, _id, event) => event),
  };
  const context = { createTurn: vi.fn(), createJob: vi.fn(), recoverTurn: vi.fn().mockResolvedValue([]) };
  const service = createMobileSessionService({ transport, createId: (prefix) => `${prefix}-${++id}` });
  const execution = createMobileSessionExecution({ userId: 'account', sessions: service, context,
    onArtworksChanged: vi.fn(), presentError: (_error, stage) => ({ message: stage }) });
  return { execution, transport, service, context };
}
async function finished(execution: ReturnType<typeof setup>['execution']) {
  await vi.waitFor(() => expect(execution.getSnapshot().isSending).toBe(false));
}

describe('Session execution lifecycle', () => {
  it('commits text and its recoverable response before streaming, and suppresses duplicate submission', async () => {
    const { execution, transport } = setup();
    const commit = deferred<typeof session>();
    transport.startTextSession.mockReturnValue(commit.promise);
    expect(await execution.sendText('Question')).toBe(true);
    expect(await execution.sendText('Duplicate')).toBe(false);
    expect(transport.streamTextResponse).not.toHaveBeenCalled();
    const sent = transport.startTextSession.mock.calls[0][0];
    expect(sent.pendingResponse.trigger_event_id).toBe(sent.event.id);
    commit.resolve(session);
    await finished(execution);
    expect(execution.getSnapshot().events.at(-1)?.payload?.status).toBe('completed');
  });

  it('does not start an old response or overwrite a new Session after reset during commit', async () => {
    const { execution, transport } = setup();
    const commit = deferred<typeof session>();
    transport.startTextSession.mockReturnValueOnce(commit.promise);
    await execution.sendText('Old question');
    const next = { session: { ...session, id: 'other' }, events: [], artworks: [] };
    execution.reset(next);
    commit.resolve(session);
    await Promise.resolve(); await Promise.resolve();
    expect(execution.getSnapshot()).toMatchObject(next);
    expect(transport.streamTextResponse).not.toHaveBeenCalled();
  });

  it('aborts a detached stream and ignores late chunks, completion, and errors', async () => {
    const { execution, transport } = setup();
    const stream = deferred<{ response: string }>();
    let callbacks!: StreamTextSessionCallbacks;
    transport.streamTextResponse.mockImplementation((_input, value) => { callbacks = value; return stream.promise; });
    await execution.sendText('Old');
    await vi.waitFor(() => expect(callbacks).toBeDefined());
    execution.reset();
    expect(callbacks.signal?.aborted).toBe(true);
    callbacks.onChunk?.('Late chunk'); callbacks.onPhase?.('generating_response');
    stream.resolve({ response: 'Late answer' });
    await Promise.resolve(); await Promise.resolve();
    expect(execution.getSnapshot()).toMatchObject({ events: [], phase: null, failure: null, isSending: false });
    expect(transport.updateEvent.mock.calls.some((call) => call[2].payload.status === 'completed')).toBe(false);
  });

  it('an old failure cannot unlock or fail the next send', async () => {
    const { execution, transport } = setup();
    const old = deferred<typeof session>(); const next = deferred<typeof session>();
    transport.startTextSession.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    await execution.sendText('Old'); execution.reset(); await execution.sendText('Next');
    old.reject(new Error('offline'));
    await Promise.resolve(); await Promise.resolve();
    expect(execution.getSnapshot()).toMatchObject({ isSending: true, failure: null });
    expect(await execution.sendText('Duplicate')).toBe(false);
    next.resolve(session); await finished(execution);
  });

  it('retries a failed completion write without generating the response again', async () => {
    const { execution, transport } = setup();
    transport.updateEvent.mockImplementationOnce(async (_s, _id, event) => event)
      .mockRejectedValueOnce(new Error('save failed'));
    await execution.sendText('Question'); await finished(execution);
    expect(execution.getSnapshot().failure?.stage).toBe('response_save');
    expect(execution.getSnapshot().events.at(-1)?.content).toBe('Answer');
    // A background read must not erase the unsaved answer/retry checkpoint.
    execution.hydrate({ session, events: [], artworks: [] });
    expect(execution.getSnapshot().events.at(-1)?.content).toBe('Answer');
    await execution.retryLastFailure();
    expect(transport.streamTextResponse).toHaveBeenCalledTimes(1);
    expect(execution.getSnapshot().failure).toBeNull();
  });

  it('retries an uncertain commit with the original event IDs', async () => {
    const { execution, transport } = setup();
    transport.startTextSession.mockRejectedValueOnce(new Error('connection lost'));
    await execution.sendText('Question'); await finished(execution);
    await execution.retryLastFailure();
    expect(transport.startTextSession.mock.calls[1][0]).toEqual(transport.startTextSession.mock.calls[0][0]);
  });

  it('restores an interrupted artwork turn and prepares its durable references before streaming', async () => {
    const { execution, service, context, transport } = setup();
    const turn = service.createArtworkAttempt('account', 'artwork', 'library', '', session.id);
    execution.reset({ session, events: [turn.userEvent, turn.responseEvent], artworks: [] });
    const recovery = deferred<[]>(); context.recoverTurn.mockReturnValue(recovery.promise);
    const retry = execution.retryFailedResponse(turn.responseEvent.id);
    await vi.waitFor(() => expect(context.recoverTurn).toHaveBeenCalled());
    expect(transport.streamTextResponse).not.toHaveBeenCalled();
    recovery.resolve([]); await retry;
    expect(transport.streamTextResponse).toHaveBeenCalledTimes(1);
  });

  it('cancels attachment preparation when leaving and ignores its eventual commit result', async () => {
    const { execution, context, service } = setup();
    const pending = deferred<unknown>();
    const job = { run: vi.fn().mockReturnValue(pending.promise), cancel: vi.fn() };
    context.createTurn.mockReturnValue(job);
    await execution.sendContext([{ kind: 'local', asset: { uri: 'file://art.jpg', fileName: 'art.jpg', mimeType: 'image/jpeg', width: 100, height: 100, source: 'camera' } }], 'Question');
    execution.reset();
    expect(job.cancel).toHaveBeenCalledTimes(1);
    const turn = service.createTextAttempt('account', 'Question');
    pending.resolve({ ready: true, entries: [], committed: { session, attempt: turn } });
    await Promise.resolve(); await Promise.resolve();
    expect(execution.getSnapshot().session).toBeNull();
  });
});
