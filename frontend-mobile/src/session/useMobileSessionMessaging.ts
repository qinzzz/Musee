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
import { buildInitialSessionTitle } from '@musee/client-core';

import {
  MOBILE_API_BASE_URL,
  mobileArtworkAnalysisService,
  mobileArtworkLibraryService,
  mobileArtworkUploadService,
  mobileSessionService,
} from '../api/runtime';
import type { NativeImageAsset, PendingArtworkUpload } from '../capture/types';
import { mapPendingMobileArtwork } from '../library/mobileArtworkLibraryService';
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
  result?: { response: string; retrieval?: Record<string, unknown> };
};

export type MobileSessionArtworkPhase =
  | 'analyzing_artwork'
  | 'saving_artwork_input'
  | 'starting_session'
  | 'uploading_artwork';

type ArtworkSubmissionContext = {
  analyzedArtwork?: MobileArtworkRecord;
  analysisComplete: boolean;
  artworks: MobileArtworkRecord[];
  attempt?: MobileTextSessionAttempt;
  baseEvents: SessionEventRecord[];
  input:
    | { asset: NativeImageAsset; kind: 'local'; source: 'capture' | 'upload' }
    | { artwork: MobileArtworkRecord; kind: 'library' };
  membershipPersisted: boolean;
  sessionId: string;
  sessionRecord: SessionRecord | null;
  text: string;
  uploadedArtwork?: PendingArtworkUpload;
  userInputPersisted: boolean;
};

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
  const artworkSubmissionContext = useRef<ArtworkSubmissionContext | null>(null);
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

  useEffect(() => clearPhaseTimer, [clearPhaseTimer]);

  const reset = useCallback(() => {
    clearPhaseTimer();
    collectionSearchShownAt.current = null;
    isSubmitting.current = false;
    attemptContext.current = null;
    artworkSubmissionContext.current = null;
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

    let stage: 'response_save' | 'stream' = 'stream';
    try {
      await mobileSessionService.persistPendingResponse(
        attempt,
        context.responsePersisted,
      );
      context.responsePersisted = true;

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

      if (stage === 'stream') {
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
      finishResponsePhase();
      setIsSending(false);
      isSubmitting.current = false;
    }
  }, [applyResponsePhase, clearPhaseTimer, finishResponsePhase, setEvents]);

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

  const runArtworkSubmission = useCallback(async (
    context: ArtworkSubmissionContext,
  ) => {
    setIsSending(true);
    setFailure(null);
    let stage: SessionFailureStage = 'upload';
    let handedToResponse = false;

    try {
      if (context.input.kind === 'local' && !context.uploadedArtwork) {
        setArtworkPhase('uploading_artwork');
        context.uploadedArtwork = await mobileArtworkUploadService.uploadArtwork(
          context.input.asset,
          userId,
          context.sessionRecord?.id,
        );
        context.membershipPersisted = Boolean(context.sessionRecord);
        const pendingArtwork = mapPendingMobileArtwork(context.uploadedArtwork);
        context.artworks = upsertArtwork(context.artworks, pendingArtwork);
        setArtworks(context.artworks);
      }

      const artworkId = context.input.kind === 'library'
        ? context.input.artwork.id
        : context.uploadedArtwork!.id;

      if (!context.sessionRecord) {
        stage = 'session_save';
        setArtworkPhase('starting_session');
        context.sessionRecord = await mobileSessionService.startArtworkSession(
          userId,
          artworkId,
          context.sessionId,
          buildInitialSessionTitle(context.text, 'New Session'),
        );
        context.membershipPersisted = true;
        setSession(context.sessionRecord);
      }

      if (!context.membershipPersisted) {
        stage = 'session_save';
        setArtworkPhase('saving_artwork_input');
        await mobileSessionService.attachArtwork(
          userId,
          context.sessionRecord.id,
          artworkId,
        );
        context.membershipPersisted = true;
      }

      if (!context.attempt) {
        context.attempt = mobileSessionService.createArtworkAttempt(
          userId,
          artworkId,
          context.input.kind === 'library' ? 'library' : context.input.source,
          context.text,
          context.sessionRecord.id,
        );
        setEvents((current) => replaceSessionEvent(current, context.attempt!.userEvent));
      }

      if (!context.userInputPersisted) {
        stage = 'user_save';
        setArtworkPhase('saving_artwork_input');
        await mobileSessionService.persistUserInput(context.attempt, context.sessionRecord);
        context.userInputPersisted = true;
      }

      if (context.input.kind === 'local' && !context.analysisComplete) {
        stage = 'analysis';
        setArtworkPhase('analyzing_artwork');
        await mobileArtworkAnalysisService.analyzeArtwork(context.uploadedArtwork!);
        context.analysisComplete = true;
      }

      if (!context.analyzedArtwork) {
        stage = 'analysis';
        context.analyzedArtwork = await mobileArtworkLibraryService.fetchArtwork(
          artworkId,
        );
        context.artworks = upsertArtwork(context.artworks, context.analyzedArtwork);
        setArtworks(context.artworks);
      }

      const responseContext: AttemptContext = {
        attempt: context.attempt,
        artworks: context.artworks,
        baseEvents: context.baseEvents,
        existingSession: context.sessionRecord,
        responsePersisted: false,
      };
      attemptContext.current = responseContext;
      artworkSubmissionContext.current = null;
      setArtworkPhase(null);
      handedToResponse = true;
      await runResponse(responseContext);
    } catch (error) {
      const presentation = presentSessionError(error, stage, ERROR_OPTIONS);
      setFailure({ ...presentation, stage });
      artworkSubmissionContext.current = context;
    } finally {
      if (!handedToResponse) {
        setArtworkPhase(null);
        setIsSending(false);
        isSubmitting.current = false;
      }
    }
  }, [runResponse, setArtworks, setEvents, setSession, userId]);

  const sendArtwork = useCallback(async (asset: NativeImageAsset, rawText: string) => {
    if (!userId || isSubmitting.current) return false;
    isSubmitting.current = true;
    const context: ArtworkSubmissionContext = {
      analysisComplete: false,
      artworks,
      baseEvents: events,
      input: {
        asset,
        kind: 'local',
        source: asset.source === 'camera' ? 'capture' : 'upload',
      },
      membershipPersisted: false,
      sessionId: session?.id || mobileSessionService.createSessionId(),
      sessionRecord: session,
      text: rawText.trim(),
      userInputPersisted: false,
    };
    artworkSubmissionContext.current = context;
    void runArtworkSubmission(context);
    return true;
  }, [artworks, events, runArtworkSubmission, session, userId]);

  const sendLibraryArtwork = useCallback(async (
    artwork: MobileArtworkRecord,
    rawText: string,
  ) => {
    if (!userId || isSubmitting.current) return false;
    isSubmitting.current = true;
    const context: ArtworkSubmissionContext = {
      analyzedArtwork: artwork,
      analysisComplete: true,
      artworks: upsertArtwork(artworks, artwork),
      baseEvents: events,
      input: { artwork, kind: 'library' },
      membershipPersisted: false,
      sessionId: session?.id || mobileSessionService.createSessionId(),
      sessionRecord: session,
      text: rawText.trim(),
      userInputPersisted: false,
    };
    artworkSubmissionContext.current = context;
    setArtworks(context.artworks);
    void runArtworkSubmission(context);
    return true;
  }, [artworks, events, runArtworkSubmission, session, setArtworks, userId]);

  const sendText = useCallback(async (rawText: string) => {
    const text = rawText.trim();
    if (!text || !userId || isSubmitting.current) return false;
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
    const artworkContext = artworkSubmissionContext.current;
    if (artworkContext) {
      isSubmitting.current = true;
      await runArtworkSubmission(artworkContext);
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
  }, [failure, runArtworkSubmission, runAttempt, runResponse, setEvents]);

  const retryFailedResponse = useCallback(async (responseEventId: string) => {
    if (!session || isSubmitting.current) return;
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
    attemptContext.current = context;
    await runResponse(context);
  }, [artworks, events, runResponse, session, userId]);

  return {
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
