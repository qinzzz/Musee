import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';

import type {
  SessionChatPhase,
  SessionEventRecord,
  SessionRecord,
} from '@musee/client-core';

import { MOBILE_API_BASE_URL, mobileSessionService } from '../api/runtime';
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
  baseEvents: SessionEventRecord[];
  existingSession: SessionRecord | null;
  responsePersisted: boolean;
  result?: { response: string; retrieval?: Record<string, unknown> };
};

type UseMobileSessionMessagingOptions = {
  events: SessionEventRecord[];
  session: SessionRecord | null;
  setEvents: Dispatch<SetStateAction<SessionEventRecord[]>>;
  setSession: Dispatch<SetStateAction<SessionRecord | null>>;
  userId: string;
};

export type MobileSessionMessagingController = {
  failure: (SessionErrorPresentation & { stage: SessionFailureStage }) | null;
  isSending: boolean;
  phase: SessionChatPhase | null;
  reset: () => void;
  retryFailedResponse: (responseEventId: string) => Promise<void>;
  retryLastFailure: () => Promise<void>;
  sendText: (text: string) => Promise<boolean>;
};

const ERROR_OPTIONS = {
  apiBaseUrl: MOBILE_API_BASE_URL,
  showTechnicalDetails: __DEV__,
};

export function useMobileSessionMessaging({
  events,
  session,
  setEvents,
  setSession,
  userId,
}: UseMobileSessionMessagingOptions): MobileSessionMessagingController {
  const [isSending, setIsSending] = useState(false);
  const [phase, setPhase] = useState<SessionChatPhase | null>(null);
  const [failure, setFailure] = useState<
    (SessionErrorPresentation & { stage: SessionFailureStage }) | null
  >(null);
  const isSubmitting = useRef(false);
  const attemptContext = useRef<AttemptContext | null>(null);

  const reset = useCallback(() => {
    isSubmitting.current = false;
    attemptContext.current = null;
    setFailure(null);
    setIsSending(false);
    setPhase(null);
  }, []);

  const runResponse = useCallback(async (context: AttemptContext) => {
    const { attempt } = context;
    setIsSending(true);
    setFailure(null);
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
        [...context.baseEvents, attempt.userEvent],
        {
          onPhase: setPhase,
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
      setPhase(null);
      setIsSending(false);
      isSubmitting.current = false;
    }
  }, [setEvents]);

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
      baseEvents: events,
      existingSession: session,
      responsePersisted: false,
    };
    attemptContext.current = context;
    setEvents([...events, attempt.userEvent, attempt.responseEvent]);
    void runAttempt(context);
    return true;
  }, [events, runAttempt, session, setEvents, userId]);

  const retryLastFailure = useCallback(async () => {
    const context = attemptContext.current;
    if (!context || isSubmitting.current || !failure) return;
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
  }, [failure, runAttempt, runResponse, setEvents]);

  const retryFailedResponse = useCallback(async (responseEventId: string) => {
    if (!session || isSubmitting.current) return;
    const responseEvent = events.find((event) => event.id === responseEventId);
    if (!responseEvent) return;
    const attempt = restoreTextSessionAttempt(responseEvent, events, session, userId);
    if (!attempt) return;

    isSubmitting.current = true;
    const context: AttemptContext = {
      attempt,
      baseEvents: events,
      existingSession: session,
      responsePersisted: true,
    };
    attemptContext.current = context;
    await runResponse(context);
  }, [events, runResponse, session, userId]);

  return {
    failure,
    isSending,
    phase,
    reset,
    retryFailedResponse,
    retryLastFailure,
    sendText,
  };
}
