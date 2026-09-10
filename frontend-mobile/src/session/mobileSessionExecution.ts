import { SessionContextCancelledError, type SessionChatPhase, type SessionEventRecord, type SessionRecord } from '@musee/client-core';
import type { MobileArtworkRecord } from '../library/types';
import { MAX_SESSION_ATTACHMENTS, type MobileContextEntry, type SessionContextInput, type createMobileSessionContextService } from './mobileSessionContextService';
import { restoreTextSessionAttempt, type MobileSessionService, type MobileTextSessionAttempt } from './mobileSessionService';
import { replaceSessionEvent, toFailedSessionResponse, toPendingSessionResponse, updateSessionEvent } from './sessionEventState';
import type { SessionErrorPresentation, SessionFailureStage } from './sessionErrorPresentation';
import type { StreamTextSessionResult } from './mobileSessionTransport';

export type MobileSessionArtworkPhase = 'analyzing_artwork' | 'saving_artwork_input' | 'starting_session' | 'uploading_artwork';
export type SessionSnapshot = {
  session: SessionRecord | null;
  events: SessionEventRecord[];
  artworks: MobileArtworkRecord[];
};
export type SessionExecutionState = SessionSnapshot & {
  contextEntries: MobileContextEntry[];
  isSending: boolean;
  phase: SessionChatPhase | null;
  artworkPhase: MobileSessionArtworkPhase | null;
  failure: (SessionErrorPresentation & { stage: SessionFailureStage }) | null;
};
type ContextService = ReturnType<typeof createMobileSessionContextService>;
type Attempt = {
  turn: MobileTextSessionAttempt;
  session: SessionRecord | null;
  committed: boolean;
  recover?: boolean;
  result?: StreamTextSessionResult;
};
const emptySnapshot = (): SessionSnapshot => ({ session: null, events: [], artworks: [] });
const idle = () => ({ contextEntries: [], isSending: false, phase: null, artworkPhase: null, failure: null });

/** Owns one conversation's transient execution; server reads hydrate only while idle. */
export function createMobileSessionExecution(dependencies: {
  userId: string;
  sessions: MobileSessionService;
  context: ContextService;
  onArtworksChanged: () => void;
  presentError: (error: unknown, stage: SessionFailureStage) => SessionErrorPresentation;
}) {
  let state: SessionExecutionState = { ...emptySnapshot(), ...idle() };
  let attempt: Attempt | null = null;
  let job: ReturnType<ContextService['createTurn']> | null = null;
  let operation: AbortController | null = null;
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<SessionExecutionState>) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };
  const replaceEvent = (event: SessionEventRecord) => publish({ events: replaceSessionEvent(state.events, event) });
  const mergeArtworks = (records: MobileArtworkRecord[]) => {
    const merged = new Map(state.artworks.map((record) => [record.id, record]));
    records.forEach((record) => merged.set(record.id, record));
    publish({ artworks: [...merged.values()] });
  };
  const fail = (error: unknown, stage: SessionFailureStage) => {
    const failure = { ...dependencies.presentError(error, stage), stage };
    publish({ failure });
    return failure;
  };
  const current = (run: AbortController) => operation === run && !run.signal.aborted;
  async function execute(work: (run: AbortController) => Promise<void>) {
    if (state.isSending) return;
    const run = new AbortController();
    operation = run;
    publish({ isSending: true, failure: null, phase: null });
    try { await work(run); }
    finally {
      if (current(run)) {
        operation = null;
        publish({ isSending: false, phase: null, artworkPhase: null });
      }
    }
  }
  async function saveResult(active: Attempt, run: AbortController) {
    try {
      const saved = await dependencies.sessions.persistResponse(active.turn, 'completed', active.result);
      if (current(run)) replaceEvent(saved);
    } catch (error) {
      if (current(run)) fail(error, 'response_save');
    }
  }
  async function respond(active: Attempt, run: AbortController) {
    if (!current(run)) return;
    replaceEvent(toPendingSessionResponse(active.turn.responseEvent));
    let stage: SessionFailureStage = 'stream';
    try {
      await dependencies.sessions.persistPendingResponse(active.turn, true);
      if (!current(run)) return;
      if (active.recover) {
        stage = 'analysis';
        publish({ artworkPhase: 'analyzing_artwork' });
        const artworks = await dependencies.context.recoverTurn(active.turn.userEvent.artwork_ids || [], run.signal);
        if (!current(run)) return;
        mergeArtworks(artworks);
        active.recover = false;
        publish({ artworkPhase: null });
      }
      stage = 'stream';
      const result = await dependencies.sessions.streamResponse(active.turn, {
        signal: run.signal,
        onPhase: (phase) => { if (current(run)) publish({ phase }); },
        onChunk: (chunk) => {
          if (!current(run)) return;
          publish({ events: updateSessionEvent(state.events, active.turn.responseEvent.id, (event) => ({
            ...event, content: `${event.content || ''}${chunk}`,
            payload: { ...event.payload, status: 'pending', phase: 'generating_response' },
          })) });
        },
      });
      if (!current(run)) return;
      active.result = result;
      replaceEvent({ ...active.turn.responseEvent, content: result.response,
        payload: { status: 'completed', ...(result.retrieval ? { retrieval: result.retrieval } : {}) } });
      await saveResult(active, run);
    } catch (error) {
      if (!current(run)) return;
      const failure = fail(error, stage);
      replaceEvent(toFailedSessionResponse(active.turn.responseEvent, failure.message));
      try { await dependencies.sessions.persistResponse(active.turn, 'failed', undefined, failure.message); }
      catch { /* Keep the original actionable error and the durable pending response. */ }
    }
  }
  async function commitText(active: Attempt, run: AbortController) {
    try {
      const saved = await dependencies.sessions.commitTextTurn(active.turn, active.session);
      if (!current(run)) return;
      active.session = saved;
      active.committed = true;
      publish({ session: saved });
      await respond(active, run);
    } catch (error) {
      if (!current(run)) return;
      const failure = fail(error, 'user_save');
      replaceEvent(toFailedSessionResponse(active.turn.responseEvent, failure.message));
    }
  }
  async function prepareContext(activeJob: NonNullable<typeof job>, run: AbortController, retryId?: string) {
    try {
      const result = await activeJob.run((entries) => {
        if (!current(run)) return;
        const active = entries.find((entry) => entry.status === 'resolving' || entry.status === 'enriching');
        publish({ contextEntries: entries, artworkPhase: active?.status === 'enriching' ? 'analyzing_artwork' : 'uploading_artwork' });
        mergeArtworks(entries.flatMap((entry) => entry.resolved ? [entry.resolved.artwork] : []));
      }, retryId);
      if (!current(run)) return;
      dependencies.onArtworksChanged();
      if (result.committed) {
        publish({ session: result.committed.session });
        replaceEvent(result.committed.attempt.userEvent);
      }
      if (!result.ready || !result.committed) {
        const failed = result.entries.find((entry) => entry.status === 'failed');
        fail(failed?.error, failed?.failureStage === 'enrich' ? 'analysis' : 'upload');
        return;
      }
      job = null;
      publish({ contextEntries: [], artworkPhase: null });
      const active: Attempt = { turn: result.committed.attempt, session: result.committed.session, committed: true };
      attempt = active;
      await respond(active, run);
    } catch (error) {
      if (current(run) && !(error instanceof SessionContextCancelledError)) fail(error, 'session_save');
    }
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    reset(snapshot: SessionSnapshot = emptySnapshot()) {
      operation?.abort();
      operation = null;
      job?.cancel();
      job = null;
      attempt = null;
      publish({ ...snapshot, ...idle() });
    },
    hydrate(snapshot: SessionSnapshot) {
      // A failed turn owns its optimistic events and retry checkpoints until resolved/reset.
      if (!state.isSending && !state.failure && !job) publish(snapshot);
    },
    updateSession(session: SessionRecord) { publish({ session }); },
    async sendText(rawText: string) {
      const text = rawText.trim();
      if (!text || !dependencies.userId || state.isSending || job) return false;
      const turn = dependencies.sessions.createTextAttempt(dependencies.userId, text, state.session?.id);
      const active: Attempt = { turn, session: state.session, committed: false };
      attempt = active;
      publish({ events: [...state.events, turn.userEvent, turn.responseEvent] });
      void execute((run) => commitText(active, run));
      return true;
    },
    async sendContext(inputs: SessionContextInput[], text: string) {
      if (!dependencies.userId || state.isSending || job || !inputs.length || inputs.length > MAX_SESSION_ATTACHMENTS) return false;
      const activeJob = dependencies.context.createTurn(inputs, dependencies.userId, text, state.session);
      job = activeJob;
      void execute((run) => prepareContext(activeJob, run));
      return true;
    },
    async retryContextEntry(id: string) {
      if (job) await execute((run) => prepareContext(job!, run, id));
    },
    async retryLastFailure() {
      if (!state.failure) return;
      const activeJob = job;
      const active = attempt;
      if (activeJob) await execute((run) => prepareContext(activeJob, run));
      else if (active) await execute(async (run) => {
        if (!active.committed) await commitText(active, run);
        else if (active.result) await saveResult(active, run);
        else await respond(active, run);
      });
    },
    async retryFailedResponse(responseEventId: string) {
      if (!state.session || state.isSending || job) return;
      const response = state.events.find((event) => event.id === responseEventId);
      if (!response) return;
      const turn = restoreTextSessionAttempt(response, state.events, state.session, dependencies.userId);
      if (!turn) return;
      const active: Attempt = { turn, session: state.session, committed: true, recover: true };
      attempt = active;
      await execute((run) => respond(active, run));
    },
  };
}
