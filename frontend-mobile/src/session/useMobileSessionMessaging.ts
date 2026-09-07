import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';

import type {
  SessionChatPhase,
  SessionEventRecord,
  SessionRecord,
} from '@musee/client-core';
import { SessionContextCancelledError } from '@musee/client-core';

import {
  MOBILE_API_BASE_URL,
  mobileSessionContextService,
  mobileSessionService,
} from '../api/runtime';
import { mobileQueryClient } from '../api/queryClient';
import type { NativeImageAsset } from '../capture/types';
import { invalidateArtworkLibraryQuery } from '../library/artworkLibraryQuery';
import { MAX_SESSION_ATTACHMENTS, type MobileContextEntry, type SessionContextInput } from './mobileSessionContextService';
import type { MobileArtworkRecord } from '../library/types';
import {
  restoreTextSessionAttempt,
  type MobileTextSessionAttempt,
} from './mobileSessionService';
import {
  replaceSessionEvent,
  toFailedSessionResponse,
  toPendingSessionResponse,
  updateSessionEvent,
} from './sessionEventState';
import {
  presentSessionError,
  type SessionErrorPresentation,
  type SessionFailureStage,
} from './sessionErrorPresentation';

type AttemptContext = {
  attempt: MobileTextSessionAttempt;
  artworks: MobileArtworkRecord[];
  baseEvents: SessionEventRecord[];
  existingSession: SessionRecord | null;
  responsePersisted: boolean;
  recoverContext?: boolean;
  result?: { response: string; retrieval?: Record<string, unknown> };
};

export type MobileSessionArtworkPhase =
  | 'analyzing_artwork'
  | 'saving_artwork_input'
  | 'starting_session'
  | 'uploading_artwork';

type ContextJob = ReturnType<typeof mobileSessionContextService.createTurn>;

type UseMobileSessionMessagingOptions = {
  artworks: MobileArtworkRecord[];
  events: SessionEventRecord[];
  session: SessionRecord | null;
  setArtworks: Dispatch<SetStateAction<MobileArtworkRecord[]>>;
  setEvents: Dispatch<SetStateAction<SessionEventRecord[]>>;
  setSession: Dispatch<SetStateAction<SessionRecord | null>>;
  userId: string;
};

export type MobileSessionMessagingController = {
  contextEntries: MobileContextEntry[];
  retryContextEntry: (id: string) => Promise<void>;
  sendContext: (inputs: SessionContextInput[], text: string) => Promise<boolean>;
  artworkPhase: MobileSessionArtworkPhase | null;
  failure: (SessionErrorPresentation & { stage: SessionFailureStage }) | null;
  isSending: boolean;
  phase: SessionChatPhase | null;
  reset: () => void;
  retryFailedResponse: (responseEventId: string) => Promise<void>;
  retryLastFailure: () => Promise<void>;
  sendArtwork: (asset: NativeImageAsset, text: string) => Promise<boolean>;
  sendLibraryArtwork: (artwork: MobileArtworkRecord, text: string) => Promise<boolean>;
  sendText: (text: string) => Promise<boolean>;
};

const ERROR_OPTIONS = {
  apiBaseUrl: MOBILE_API_BASE_URL,
  showTechnicalDetails: __DEV__,
};
const COLLECTION_SEARCH_MIN_VISIBLE_MS = 600;

function upsertArtwork(
  artworks: MobileArtworkRecord[],
  replacement: MobileArtworkRecord,
): MobileArtworkRecord[] {
  const index = artworks.findIndex((artwork) => artwork.id === replacement.id);
  if (index < 0) return [...artworks, replacement];
  return artworks.map((artwork, artworkIndex) => (
    artworkIndex === index ? replacement : artwork
  ));
}

export function useMobileSessionMessaging({
  artworks,
  events,
  session,
  setArtworks,
  setEvents,
  setSession,
  userId,
}: UseMobileSessionMessagingOptions): MobileSessionMessagingController {
  const [isSending, setIsSending] = useState(false);
  const [phase, setPhase] = useState<SessionChatPhase | null>(null);
  const [artworkPhase, setArtworkPhase] = useState<MobileSessionArtworkPhase | null>(null);
  const [failure, setFailure] = useState<
    (SessionErrorPresentation & { stage: SessionFailureStage }) | null
  >(null);
  const isSubmitting = useRef(false);
  const attemptContext = useRef<AttemptContext | null>(null);
  const contextJob = useRef<ContextJob | null>(null);
  const contextVersion = useRef(0);
  const [contextEntries, setContextEntries] = useState<MobileContextEntry[]>([]);
  const phaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const collectionSearchShownAt = useRef<number | null>(null);

  const clearPhaseTimer = useCallback(() => {
    if (phaseTimer.current !== null) {
      clearTimeout(phaseTimer.current);
      phaseTimer.current = null;
    }
  }, []);

  const applyResponsePhase = useCallback((nextPhase: SessionChatPhase) => {
    clearPhaseTimer();
    if (nextPhase === 'retrieving_collection') {
      collectionSearchShownAt.current = Date.now();
      setPhase(nextPhase);
      return;
    }
    if (
      nextPhase === 'generating_response'
      && collectionSearchShownAt.current !== null
    ) {
      const elapsed = Date.now() - collectionSearchShownAt.current;
      const remaining = COLLECTION_SEARCH_MIN_VISIBLE_MS - elapsed;
      if (remaining > 0) {
        phaseTimer.current = setTimeout(() => {
          phaseTimer.current = null;
          collectionSearchShownAt.current = null;
          setPhase(nextPhase);
        }, remaining);
        return;
      }
      collectionSearchShownAt.current = null;
    }
    setPhase(nextPhase);
  }, [clearPhaseTimer]);

  const finishResponsePhase = useCallback(() => {
    clearPhaseTimer();
    if (collectionSearchShownAt.current !== null) {
      const elapsed = Date.now() - collectionSearchShownAt.current;
      const remaining = COLLECTION_SEARCH_MIN_VISIBLE_MS - elapsed;
      if (remaining > 0) {
        phaseTimer.current = setTimeout(() => {
          phaseTimer.current = null;
          collectionSearchShownAt.current = null;
          setPhase(null);
        }, remaining);
        return;
      }
    }
    collectionSearchShownAt.current = null;
    setPhase(null);
  }, [clearPhaseTimer]);

  useEffect(() => () => {
    clearPhaseTimer();
    contextVersion.current++;
    contextJob.current?.cancel();
    contextJob.current = null;
  }, [clearPhaseTimer]);

  const reset = useCallback(() => {
    clearPhaseTimer();
    collectionSearchShownAt.current = null;
    isSubmitting.current = false;
    attemptContext.current = null;
    contextVersion.current++;
    contextJob.current?.cancel();
    contextJob.current = null;
    setContextEntries([]);
    setFailure(null);
    setIsSending(false);
    setPhase(null);
    setArtworkPhase(null);
  }, [clearPhaseTimer]);

  const runResponse = useCallback(async (context: AttemptContext) => {
    const { attempt } = context;
    setIsSending(true);
    setFailure(null);
    clearPhaseTimer();
    collectionSearchShownAt.current = null;
    setPhase(null);
    setEvents((current) => replaceSessionEvent(
      current,
      toPendingSessionResponse(attempt.responseEvent),
    ));

    let stage: 'response_save' | 'stream' | 'analysis' = 'stream';
    try {
      await mobileSessionService.persistPendingResponse(
        attempt,
        context.responsePersisted,
      );
      context.responsePersisted = true;
      if (context.recoverContext) {
        stage = 'analysis';
        setArtworkPhase('analyzing_artwork');
        const recovered = await mobileSessionContextService.recoverTurn(attempt.userEvent.artwork_ids || []);
        setArtworks((current) => recovered.reduce(upsertArtwork, current));
        context.recoverContext = false;
        setArtworkPhase(null);
      }
      stage = 'stream';
      const result = await mobileSessionService.streamResponse(
        attempt,
        {
          onPhase: applyResponsePhase,
          onChunk: (chunk) => setEvents((current) => updateSessionEvent(
            current,
            attempt.responseEvent.id,
            (event) => ({
              ...event,
              content: `${event.content || ''}${chunk}`,
              payload: { ...event.payload, status: 'pending', phase: 'generating_response' },
            }),
          )),
        },
      );
      context.result = result;
      const completedEvent: SessionEventRecord = {
        ...attempt.responseEvent,
        content: result.response,
        payload: {
          status: 'completed',
          ...(result.retrieval ? { retrieval: result.retrieval } : {}),
        },
      };
      setEvents((current) => replaceSessionEvent(current, completedEvent));

      stage = 'response_save';
      const persisted = await mobileSessionService.persistResponse(
        attempt,
        'completed',
        result,
      );
      setEvents((current) => replaceSessionEvent(current, persisted));
    } catch (error) {
      const presentation = presentSessionError(error, stage, ERROR_OPTIONS);
      setFailure({ ...presentation, stage });

      if (stage === 'stream' || stage === 'analysis') {
        setEvents((current) => replaceSessionEvent(
          current,
          toFailedSessionResponse(attempt.responseEvent, presentation.message),
        ));
        try {
          await mobileSessionService.persistResponse(
            attempt,
            'failed',
            undefined,
            presentation.message,
          );
          context.responsePersisted = true;
        } catch {
          // The original stream error remains the actionable failure.
        }
      }
    } finally {
      setArtworkPhase(null);
      finishResponsePhase();
      setIsSending(false);
      isSubmitting.current = false;
    }
  }, [applyResponsePhase, clearPhaseTimer, finishResponsePhase, setEvents, setArtworks]);

  const runAttempt = useCallback(async (context: AttemptContext) => {
    setIsSending(true);
    setFailure(null);
    try {
      const persistedSession = await mobileSessionService.persistUserInput(
        context.attempt,
        context.existingSession,
      );
      context.existingSession = persistedSession;
      setSession(persistedSession);
      await runResponse(context);
    } catch (error) {
      const presentation = presentSessionError(error, 'user_save', ERROR_OPTIONS);
      setFailure({ ...presentation, stage: 'user_save' });
      setEvents((current) => replaceSessionEvent(
        current,
        toFailedSessionResponse(context.attempt.responseEvent, presentation.message),
      ));
      setIsSending(false);
      isSubmitting.current = false;
    }
  }, [runResponse, setEvents, setSession]);

  const runContext = useCallback(async (job: ContextJob, retryId?: string) => {
    const version = contextVersion.current;
    setIsSending(true);
    setFailure(null);
    let stage: SessionFailureStage = 'session_save';
    try {
      const result = await job.run((entries) => {
        if (contextJob.current !== job) return;
        setContextEntries(entries);
        const active = entries.find((entry) => entry.status === 'resolving' || entry.status === 'enriching');
        setArtworkPhase(active?.status === 'enriching' ? 'analyzing_artwork' : 'uploading_artwork');
        const resolved = entries.flatMap((entry) => entry.resolved ? [entry.resolved.artwork] : []);
        setArtworks((current) => resolved.reduce(upsertArtwork, current));
      }, retryId);
      if (contextJob.current !== job) return;
      invalidateArtworkLibraryQuery(mobileQueryClient, userId);
      if (result.committed) {
        setSession(result.committed.session);
        setEvents((current) => replaceSessionEvent(current, result.committed!.attempt.userEvent));
      }
      if (!result.ready || !result.committed) {
        const failed = result.entries.find((entry) => entry.status === 'failed');
        stage = failed?.failureStage === 'enrich' ? 'analysis' : 'upload';
        const presentation = presentSessionError(failed?.error, stage, ERROR_OPTIONS);
        setFailure({ ...presentation, stage });
        return;
      }
      contextJob.current = null;
      setContextEntries([]);
      const responseContext: AttemptContext = {
        attempt: result.committed.attempt, existingSession: result.committed.session,
        artworks: result.entries.map((entry) => entry.resolved!.artwork), baseEvents: [], responsePersisted: true,
      };
      setSession(result.committed.session);
      setEvents((current) => replaceSessionEvent(current, result.committed!.attempt.userEvent));
      attemptContext.current = responseContext;
      setArtworkPhase(null);
      await runResponse(responseContext);
    } catch (error) {
      if (version === contextVersion.current && !(error instanceof SessionContextCancelledError)) {
        setFailure({ ...presentSessionError(error, stage, ERROR_OPTIONS), stage });
      }
    } finally {
      if (version === contextVersion.current) {
        setArtworkPhase(null);
        setIsSending(false);
        isSubmitting.current = false;
      }
    }
  }, [runResponse, setArtworks, setSession, setEvents, userId]);

  const sendContext = useCallback(async (inputs: SessionContextInput[], rawText: string) => {
    if (!userId || isSubmitting.current || contextJob.current || !inputs.length || inputs.length > MAX_SESSION_ATTACHMENTS) return false;
    const job = mobileSessionContextService.createTurn(inputs, userId, rawText, session);
    isSubmitting.current = true;
    contextJob.current = job;
    void runContext(job);
    return true;
  }, [runContext, session, userId]);

  const sendArtwork = useCallback((asset: NativeImageAsset, text: string) => (
    sendContext([{ kind: 'local', asset }], text)
  ), [sendContext]);
  const sendLibraryArtwork = useCallback((artwork: MobileArtworkRecord, text: string) => (
    sendContext([{ kind: 'library', artwork }], text)
  ), [sendContext]);
  const retryContextEntry = useCallback(async (id: string) => {
    if (isSubmitting.current || !contextJob.current) return;
    isSubmitting.current = true;
    await runContext(contextJob.current, id);
  }, [runContext]);

  const sendText = useCallback(async (rawText: string) => {
    const text = rawText.trim();
    if (!text || !userId || isSubmitting.current || contextJob.current) return false;
    isSubmitting.current = true;

    const attempt = mobileSessionService.createTextAttempt(
      userId,
      text,
      session?.id,
    );
    const context: AttemptContext = {
      attempt,
      artworks,
      baseEvents: events,
      existingSession: session,
      responsePersisted: false,
    };
    attemptContext.current = context;
    setEvents([...events, attempt.userEvent, attempt.responseEvent]);
    void runAttempt(context);
    return true;
  }, [artworks, events, runAttempt, session, setEvents, userId]);

  const retryLastFailure = useCallback(async () => {
    if (isSubmitting.current || !failure) return;
    const job = contextJob.current;
    if (job) {
      isSubmitting.current = true;
      await runContext(job);
      return;
    }
    const context = attemptContext.current;
    if (!context) return;
    isSubmitting.current = true;

    if (failure.stage === 'user_save') {
      await runAttempt(context);
      return;
    }
    if (failure.stage === 'response_save' && context.result) {
      setIsSending(true);
      try {
        const persisted = await mobileSessionService.persistResponse(
          context.attempt,
          'completed',
          context.result,
        );
        setEvents((current) => replaceSessionEvent(current, persisted));
        setFailure(null);
      } catch (error) {
        const presentation = presentSessionError(error, 'response_save', ERROR_OPTIONS);
        setFailure({ ...presentation, stage: 'response_save' });
      } finally {
        setIsSending(false);
        isSubmitting.current = false;
      }
      return;
    }
    await runResponse(context);
  }, [failure, runContext, runAttempt, runResponse, setEvents]);

  const retryFailedResponse = useCallback(async (responseEventId: string) => {
    if (!session || isSubmitting.current || contextJob.current) return;
    const responseEvent = events.find((event) => event.id === responseEventId);
    if (!responseEvent) return;
    const attempt = restoreTextSessionAttempt(responseEvent, events, session, userId);
    if (!attempt) return;

    isSubmitting.current = true;
    const context: AttemptContext = {
      attempt,
      artworks,
      baseEvents: events,
      existingSession: session,
      responsePersisted: true,
    };
    context.recoverContext = true;
    attemptContext.current = context;
    await runResponse(context);
  }, [artworks, events, runResponse, session, userId]);

  return {
    contextEntries,
    sendContext,
    retryContextEntry,
    artworkPhase,
    failure,
    isSending,
    phase,
    reset,
    retryFailedResponse,
    retryLastFailure,
    sendArtwork,
    sendLibraryArtwork,
    sendText,
  };
}
