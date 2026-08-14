import { useCallback, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { SessionAuthenticationError, streamSessionChat } from '../../api/chat';
import type { ArtworkWorkspace, GalleryItem } from '../../types';
import {
  appendSessionEvents as appendSessionEventsApi,
  startSessionWithEvent,
  updateSessionEvent,
} from '../api/sessions';
import { itemBelongsToSession, newSessionEventId } from '../lib/sessionLinks';
import { getSessionHistoryBeforeTrigger, serializeSessionHistory } from '../lib/sessionHistory';
import { buildInitialSessionTitle } from '../lib/sessionCreation';
import { SESSION_FAILURE_MESSAGES } from '../lib/sessionFailureStatus';
import { compareSessionEvents, nextLocalOrder } from '../lib/sessionOrdering';
import type { SessionDraft, SessionStreamMessage, SessionSummary } from '../types';

type ToastType = 'info' | 'success';
type ShowToast = (message: string, type?: ToastType) => void;

const SESSION_EVENT_SAVE_ERROR = 'Couldn’t save this session update. Try again.';
const MODEL_RESPONSE_SAVE_ERROR = 'This response couldn’t be saved. Try again.';
const AUTH_REQUIRED_MESSAGE = 'Your session expired. Sign in again to continue.';
const GUEST_LIMIT_MESSAGE = 'You’ve reached the guest preview limit. Sign in to continue this conversation.';

const getErrorCode = (error: unknown): string | undefined => (
  error instanceof Error && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined
);

export type SessionAuthenticationRetry = {
  sessionId: string;
  responseId: string;
  message: string;
  parentEventId?: string;
};

type UseSessionMessagingOptions = {
  defaultSessionTitle: string;
  sessionUserId: string;
  isComposingNewSession: boolean;
  items: GalleryItem[];
  sessionStreams: Record<string, SessionStreamMessage[]>;
  streamingSessionResponses: Record<string, string>;
  sessionSummaries: SessionSummary[];
  activeSessionSummary: SessionSummary | null;
  refreshPersistedSessions: () => void;
  setSessionDrafts: Dispatch<SetStateAction<SessionDraft[]>>;
  setFilteredSessionId: Dispatch<SetStateAction<string | null>>;
  setIsComposingNewSession: Dispatch<SetStateAction<boolean>>;
  setVisit: Dispatch<SetStateAction<ArtworkWorkspace>>;
  setSessionStreams: Dispatch<SetStateAction<Record<string, SessionStreamMessage[]>>>;
  setStreamingSessionResponses: Dispatch<SetStateAction<Record<string, string>>>;
  showToast: ShowToast;
};

const toSessionChatArtwork = (item: GalleryItem) => ({
  id: item.id,
  url: item.url,
  keywords: item.keywords,
  artistName: item.artistName,
  artworkName: item.artworkName,
  description: item.description,
  date: item.date,
  medium: item.medium,
});

const getSessionArtworkIds = (sessionItems: GalleryItem[]) => (
  sessionItems
    .map((item) => item.artworkId || item.id)
    .filter((artworkId, index, all) => Boolean(artworkId) && all.indexOf(artworkId) === index)
);

const getNextLocalEventCreatedAt = (
  existingMessages: SessionStreamMessage[],
  floor = Date.now(),
) => Math.max(
  floor,
  (existingMessages[existingMessages.length - 1]?.createdAt ?? 0) + 1,
);

const sortSessionStreamMessages = (messages: SessionStreamMessage[]) => (
  [...messages].sort(compareSessionEvents)
);

export function useSessionMessaging({
  defaultSessionTitle,
  sessionUserId,
  isComposingNewSession,
  items,
  sessionStreams,
  streamingSessionResponses,
  sessionSummaries,
  activeSessionSummary,
  refreshPersistedSessions,
  setSessionDrafts,
  setFilteredSessionId,
  setIsComposingNewSession,
  setVisit,
  setSessionStreams,
  setStreamingSessionResponses,
  showToast,
}: UseSessionMessagingOptions) {
  const sessionEventWriteQueuesRef = useRef<Record<string, Promise<unknown>>>({});
  const sessionRepliesInFlightRef = useRef<Set<string>>(new Set());
  const userSubmissionSessionIdRef = useRef<string | null>(null);

  const hasPendingSessionReply = useCallback((sessionId: string | null | undefined) => (
    Boolean(
      sessionId
      && (
        sessionRepliesInFlightRef.current.has(sessionId)
        || Object.prototype.hasOwnProperty.call(streamingSessionResponses, sessionId)
      )
    )
  ), [streamingSessionResponses]);

  const markSessionReplyPending = useCallback((sessionId: string) => {
    sessionRepliesInFlightRef.current.add(sessionId);
    setStreamingSessionResponses((prev) => (
      Object.prototype.hasOwnProperty.call(prev, sessionId)
        ? prev
        : { ...prev, [sessionId]: '' }
    ));
  }, [setStreamingSessionResponses]);

  const clearSessionReplyPending = useCallback((sessionId: string) => {
    sessionRepliesInFlightRef.current.delete(sessionId);
    if (userSubmissionSessionIdRef.current === sessionId) {
      userSubmissionSessionIdRef.current = null;
    }
    setStreamingSessionResponses((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, sessionId)) return prev;
      const next = { ...prev };
      delete next[sessionId];
      return next;
    });
  }, [setStreamingSessionResponses]);

  const enqueueSessionEventWrite = useCallback(<T,>(
    sessionId: string,
    task: () => Promise<T>,
  ): Promise<T> => {
    const previous = sessionEventWriteQueuesRef.current[sessionId] || Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(task);
    const tracked = next.finally(() => {
      if (sessionEventWriteQueuesRef.current[sessionId] === tracked) {
        delete sessionEventWriteQueuesRef.current[sessionId];
      }
    });
    sessionEventWriteQueuesRef.current[sessionId] = tracked;
    void tracked.catch(() => undefined);
    return next;
  }, []);

  const createSessionDraft = useCallback((initialTitle = defaultSessionTitle) => {
    const now = Date.now();
    const newSession: SessionDraft = {
      id: `session_${Math.random().toString(36).substring(2, 11)}`,
      title: initialTitle,
      createdAt: now,
      updatedAt: now,
    };
    setSessionDrafts((prev) => [newSession, ...prev.filter((session) => session.id !== newSession.id)]);
    setFilteredSessionId(newSession.id);
    setIsComposingNewSession(false);
    setVisit({
      id: newSession.id,
      itemIds: [],
      globalConversation: [],
    });
    return newSession.id;
  }, [
    defaultSessionTitle,
    setFilteredSessionId,
    setIsComposingNewSession,
    setVisit,
    setSessionDrafts,
  ]);

  const persistSessionEvents = useCallback((sessionId: string, newEvents: SessionStreamMessage[]) => (
    enqueueSessionEventWrite(sessionId, () => (
      appendSessionEventsApi(
        sessionId,
        newEvents.map((event) => {
          const isPlaceholder = event.type === 'artwork_capture' || event.type === 'artwork_card';
          return {
            id: event.id,
            role: event.role as 'user' | 'model',
            type: event.type || 'text',
            event_type: event.type === 'model_response' || event.type === 'artwork_commentary'
              ? 'model_response'
              : undefined,
            content: isPlaceholder ? undefined : event.text,
            artwork_id: event.artworkId,
            artwork_ids: event.artworkIds,
            trigger_event_id: event.role === 'user' ? undefined : event.triggerEventId,
            payload: event.type === 'model_response' || event.type === 'artwork_commentary'
              ? event.payload || { status: 'completed' }
              : undefined,
            created_at: event.createdAt,
          };
        }),
      ).finally(() => {
        refreshPersistedSessions();
      })
    ))
  ), [enqueueSessionEventWrite, refreshPersistedSessions]);

  const appendLocalSessionEvents = useCallback((sessionId: string, newEvents: SessionStreamMessage[]) => {
    setSessionStreams((prev) => ({
      ...prev,
      [sessionId]: sortSessionStreamMessages(
        [...(prev[sessionId] || []), ...newEvents].reduce<SessionStreamMessage[]>((acc, event) => {
          const existingIndex = acc.findIndex((entry) => entry.id === event.id);
          if (existingIndex >= 0) {
            acc[existingIndex] = event;
          } else {
            acc.push(event);
          }
          return acc;
        }, []),
      ),
    }));
    setSessionDrafts((prev) => {
      const nextUpdatedAt = newEvents[newEvents.length - 1]?.createdAt || Date.now();
      const existingDraft = prev.find((draft) => draft.id === sessionId);
      if (existingDraft) {
        return prev.map((draft) =>
          draft.id === sessionId ? { ...draft, updatedAt: nextUpdatedAt } : draft,
        );
      }
      const summary = sessionSummaries.find((sessionSummary) => sessionSummary.id === sessionId);
      return [
        {
          id: sessionId,
          title: summary?.title || defaultSessionTitle,
          createdAt: nextUpdatedAt,
          updatedAt: nextUpdatedAt,
        },
        ...prev,
      ];
    });
  }, [
    defaultSessionTitle,
    setSessionDrafts,
    setSessionStreams,
    sessionSummaries,
  ]);

  const updateLocalSessionEvent = useCallback((
    sessionId: string,
    eventId: string,
    updater: (event: SessionStreamMessage) => SessionStreamMessage,
  ) => {
    setSessionStreams((prev) => {
      const existing = prev[sessionId] || [];
      return {
        ...prev,
        [sessionId]: sortSessionStreamMessages(
          existing.map((event) => (event.id === eventId ? updater(event) : event)),
        ),
      };
    });
  }, [setSessionStreams]);

  const appendSessionEvents = useCallback((
    sessionId: string,
    newEvents: SessionStreamMessage[],
    options?: { persist?: boolean },
  ) => {
    appendLocalSessionEvents(sessionId, newEvents);
    if (options?.persist === false) {
      return;
    }
    void persistSessionEvents(sessionId, newEvents).catch((error) => {
      console.error('Failed to persist session events:', error);
      showToast(getErrorCode(error) === 'guest_quota_exhausted'
        ? GUEST_LIMIT_MESSAGE
        : SESSION_EVENT_SAVE_ERROR, 'info');
    });
  }, [
    appendLocalSessionEvents,
    persistSessionEvents,
    showToast,
  ]);

  // Persist a batch of added artworks as ONE canonical user_input event
  // (artworks live in payload.artworks with their source). The legacy
  // per-artwork artwork_capture/artwork_card messages stay local-only for
  // optimistic rendering; this is what actually reaches session_events.
  const persistSessionArtworkInput = useCallback((
    sessionId: string,
    artworks: Array<{ artworkId: string; source: 'upload' | 'capture' | 'library' }>,
    userInputEventId: string,
    content?: string,
  ) => {
    const entries = artworks.filter((entry) => entry.artworkId);
    const normalizedContent = content?.trim();
    if (entries.length === 0 && !normalizedContent) {
      return Promise.resolve();
    }
    return enqueueSessionEventWrite(sessionId, () => (
      appendSessionEventsApi(sessionId, [{
        id: userInputEventId,
        role: 'user',
        event_type: 'user_input',
        content: normalizedContent,
        artwork_ids: entries.map((entry) => entry.artworkId),
        payload: { artworks: entries.map((entry) => ({ artwork_id: entry.artworkId, source: entry.source })) },
      }]).finally(() => {
        refreshPersistedSessions();
      })
    ));
  }, [enqueueSessionEventWrite, refreshPersistedSessions]);

  const persistPendingModelResponse = useCallback((
    sessionId: string,
    responseId: string,
    artworkIds: string[],
    createdAt: number,
    parentEventId?: string,
  ) => (
    enqueueSessionEventWrite(sessionId, () => (
      appendSessionEventsApi(sessionId, [{
        id: responseId,
        role: 'model',
        event_type: 'model_response',
        artwork_ids: artworkIds,
        trigger_event_id: parentEventId,
        payload: { status: 'pending' },
        created_at: createdAt,
      }]).finally(() => {
        refreshPersistedSessions();
      })
    ))
  ), [enqueueSessionEventWrite, refreshPersistedSessions]);

  const finalizeModelResponse = useCallback(async (
    sessionId: string,
    responseId: string,
    artworkIds: string[],
    status: 'pending' | 'completed' | 'failed' | 'auth_required',
    parentEventId?: string,
    options?: { content?: string; errorMessage?: string; errorCode?: string; retryMessage?: string },
  ) => {
    const messagePayload = {
      role: 'model' as const,
      event_type: 'model_response' as const,
      content: options?.content,
      artwork_ids: artworkIds,
      trigger_event_id: parentEventId,
      payload: {
        status,
        ...(options?.errorMessage ? { error_message: options.errorMessage } : {}),
        ...(options?.errorCode ? { error_code: options.errorCode } : {}),
        ...(options?.retryMessage ? { retry_message: options.retryMessage } : {}),
      },
    };

    await enqueueSessionEventWrite(sessionId, async () => {
      try {
        await updateSessionEvent(sessionId, responseId, messagePayload);
      } catch (_error) {
        await appendSessionEventsApi(sessionId, [{
          id: responseId,
          ...messagePayload,
        }]);
      } finally {
        refreshPersistedSessions();
      }
    });
  }, [enqueueSessionEventWrite, refreshPersistedSessions]);

  const streamSessionInquiryResponse = useCallback((
    targetSessionId: string,
    text: string,
    sessionItemsOverride?: GalleryItem[],
    historyOverride?: SessionStreamMessage[],
    parentEventIdOverride?: string,
    responseIdOverride?: string,
  ) => {
    markSessionReplyPending(targetSessionId);

    const existingMessages = historyOverride || sessionStreams[targetSessionId] || [];
    const historyForPrompt = getSessionHistoryBeforeTrigger(existingMessages, parentEventIdOverride);
    const sessionItems = sessionItemsOverride
      || (activeSessionSummary?.id === targetSessionId
        ? activeSessionSummary.items
        : items.filter((item) => itemBelongsToSession(item, targetSessionId)));
    const responseId = responseIdOverride || newSessionEventId();
    const commentaryCreatedAt = getNextLocalEventCreatedAt(existingMessages);
    const commentaryArtworkIds = getSessionArtworkIds(sessionItems);
    const parentEventId = parentEventIdOverride;
    const pendingCommentaryMessage: SessionStreamMessage = {
      id: responseId,
      role: 'model',
      text: '',
      type: 'model_response',
      artworkIds: commentaryArtworkIds,
      triggerEventId: parentEventId,
      createdAt: commentaryCreatedAt,
      localOrder: nextLocalOrder(),
      payload: { status: 'pending' },
    };

    if (responseIdOverride) {
      updateLocalSessionEvent(targetSessionId, responseId, (event) => ({
        ...event,
        text: '',
        payload: { status: 'pending' },
      }));
    } else {
      appendSessionEvents(targetSessionId, [pendingCommentaryMessage], { persist: false });
    }

    const pendingPersistence = responseIdOverride
      ? finalizeModelResponse(targetSessionId, responseId, commentaryArtworkIds, 'pending', parentEventId, { content: '' })
      : persistPendingModelResponse(targetSessionId, responseId, commentaryArtworkIds, commentaryCreatedAt, parentEventId);
    void pendingPersistence.catch((error) => {
      // Completion performs an update-then-create retry, so only log this
      // preliminary failure and surface an error if the final save also fails.
      console.error('Failed to persist pending model response:', error);
    });

    streamSessionChat(
      sessionItems.map(toSessionChatArtwork),
      serializeSessionHistory(historyForPrompt, sessionItems),
      text,
      (chunk) => {
        updateLocalSessionEvent(targetSessionId, responseId, (event) => ({
          ...event,
          text: `${event.text || ''}${chunk}`,
          payload: {
            ...(event.payload || {}),
            status: 'pending',
          },
        }));
        setStreamingSessionResponses((prev) => ({
          ...prev,
          [targetSessionId]: (prev[targetSessionId] || '') + chunk,
        }));
      },
      (fullResponse) => {
        updateLocalSessionEvent(targetSessionId, responseId, (event) => ({
          ...event,
          text: fullResponse,
          payload: {
            ...(event.payload || {}),
            status: 'completed',
          },
        }));
        void finalizeModelResponse(
          targetSessionId,
          responseId,
          commentaryArtworkIds,
          'completed',
          parentEventId,
          { content: fullResponse },
        ).catch((error) => {
          console.error('Failed to persist completed model response:', error);
          showToast(MODEL_RESPONSE_SAVE_ERROR, 'info');
        });
        clearSessionReplyPending(targetSessionId);
      },
      (error) => {
        if (getErrorCode(error) === 'guest_quota_exhausted') {
          updateLocalSessionEvent(targetSessionId, responseId, (event) => ({
            ...event,
            text: GUEST_LIMIT_MESSAGE,
            payload: {
              ...(event.payload || {}),
              status: 'failed',
              error_code: 'guest_quota_exhausted',
            },
          }));
          clearSessionReplyPending(targetSessionId);
          return;
        }
        if (error instanceof SessionAuthenticationError) {
          updateLocalSessionEvent(targetSessionId, responseId, (event) => ({
            ...event,
            text: AUTH_REQUIRED_MESSAGE,
            payload: {
              ...(event.payload || {}),
              status: 'auth_required',
              error_code: error.code,
              retry_message: text,
            },
          }));
          void finalizeModelResponse(
            targetSessionId,
            responseId,
            commentaryArtworkIds,
            'auth_required',
            parentEventId,
            { content: AUTH_REQUIRED_MESSAGE, errorCode: error.code, retryMessage: text },
          ).catch((saveError) => {
            console.error('Failed to persist authentication-required response:', saveError);
            showToast(MODEL_RESPONSE_SAVE_ERROR, 'info');
          });
          clearSessionReplyPending(targetSessionId);
          return;
        }
        updateLocalSessionEvent(targetSessionId, responseId, (event) => ({
          ...event,
          payload: {
            ...(event.payload || {}),
            status: 'failed',
            error_message: 'Something interrupted the reflection stream. Please try again.',
          },
        }));
        void finalizeModelResponse(
          targetSessionId,
          responseId,
          commentaryArtworkIds,
          'failed',
          parentEventId,
          { errorMessage: 'Something interrupted the reflection stream. Please try again.' },
        ).catch((error) => {
          console.error('Failed to persist failed model response:', error);
          showToast(MODEL_RESPONSE_SAVE_ERROR, 'info');
        });
        clearSessionReplyPending(targetSessionId);
      },
      {
        userId: sessionUserId,
        sessionId: targetSessionId,
        triggerEventId: parentEventId,
      },
    );
  }, [
    activeSessionSummary,
    appendSessionEvents,
    clearSessionReplyPending,
    finalizeModelResponse,
    items,
    markSessionReplyPending,
    persistPendingModelResponse,
    sessionUserId,
    setStreamingSessionResponses,
    sessionStreams,
    showToast,
    updateLocalSessionEvent,
  ]);

  const retryAuthenticationRequiredResponse = useCallback((retry: SessionAuthenticationRetry) => {
    streamSessionInquiryResponse(
      retry.sessionId,
      retry.message,
      undefined,
      sessionStreams[retry.sessionId] || [],
      retry.parentEventId,
      retry.responseId,
    );
  }, [sessionStreams, streamSessionInquiryResponse]);

  const sendSessionInquiryToSession = useCallback((
    targetSessionId: string,
    text: string,
    sessionItemsOverride?: GalleryItem[],
    options?: {
      persistUserMessage?: boolean;
      parentEventIdOverride?: string;
      historyOverride?: SessionStreamMessage[];
      localUserMessageOverride?: SessionStreamMessage;
    },
  ) => {
    const existingMessages = options?.historyOverride || sessionStreams[targetSessionId] || [];
    let nextHistory = existingMessages;
    const userEventId = options?.parentEventIdOverride || newSessionEventId();

    if (options?.persistUserMessage !== false) {
      const createdAt = Date.now();
      const userMsg: SessionStreamMessage = options?.localUserMessageOverride || {
        id: userEventId,
        role: 'user',
        text,
        triggerEventId: userEventId,
        createdAt,
        localOrder: nextLocalOrder(),
      };
      appendSessionEvents(targetSessionId, [userMsg]);
      nextHistory = [...existingMessages, userMsg];
    } else if (options?.localUserMessageOverride) {
      appendSessionEvents(targetSessionId, [options.localUserMessageOverride], { persist: false });
      nextHistory = [...existingMessages, options.localUserMessageOverride];
    }

    streamSessionInquiryResponse(
      targetSessionId,
      text,
      sessionItemsOverride,
      nextHistory,
      options?.parentEventIdOverride || (options?.persistUserMessage === false ? undefined : userEventId),
    );
  }, [
    appendSessionEvents,
    streamSessionInquiryResponse,
    sessionStreams,
  ]);

  const handleSessionInquiry = useCallback(async (text: string) => {
    // This ref closes the gap before React can repaint the busy state. It also
    // protects the blank-session path, where repeated submits would otherwise
    // create a fresh draft id for every click while the first POST is pending.
    if (userSubmissionSessionIdRef.current) {
      return false;
    }

    let targetSessionId = activeSessionSummary?.id;
    if (!targetSessionId || isComposingNewSession) {
      targetSessionId = createSessionDraft(buildInitialSessionTitle(text, defaultSessionTitle));
    }

    if (hasPendingSessionReply(targetSessionId)) {
      return false;
    }

    userSubmissionSessionIdRef.current = targetSessionId;
    markSessionReplyPending(targetSessionId);

    const targetSummary = sessionSummaries.find((summary) => summary.id === targetSessionId);
    const shouldPersistSession = !targetSummary || targetSummary.items.length === 0;

    if (shouldPersistSession) {
      const createdAt = Date.now();
      const userEventId = newSessionEventId();
      const userMsg: SessionStreamMessage = {
        id: userEventId,
        role: 'user',
        text,
        triggerEventId: userEventId,
        createdAt,
        localOrder: nextLocalOrder(),
      };
      appendLocalSessionEvents(targetSessionId, [userMsg]);

      try {
        await startSessionWithEvent(sessionUserId, {
          session_id: targetSessionId,
          title: targetSummary?.title || buildInitialSessionTitle(text, defaultSessionTitle),
          event: {
            id: userMsg.id,
            role: 'user',
            event_type: 'user_input',
            content: text,
            created_at: createdAt,
          },
        });
        refreshPersistedSessions();
        streamSessionInquiryResponse(
          targetSessionId,
          text,
          undefined,
          [...(sessionStreams[targetSessionId] || []), userMsg],
          userEventId,
        );
      } catch (error) {
        clearSessionReplyPending(targetSessionId);
        const policyErrorCode = getErrorCode(error);
        const failureMessage = policyErrorCode === 'guest_quota_exhausted'
          ? GUEST_LIMIT_MESSAGE
          : SESSION_FAILURE_MESSAGES.session;
        appendLocalSessionEvents(targetSessionId, [{
          id: newSessionEventId(),
          role: 'model',
          type: 'text',
          text: failureMessage,
          payload: {
            message_kind: 'session_failure',
            error_code: policyErrorCode || 'session_save_failed',
          },
          triggerEventId: userEventId,
          createdAt: createdAt + 1,
          localOrder: nextLocalOrder(),
        }]);
        console.error('Failed to commit first session event:', error);
        return false;
      }
      return true;
    }

    try {
      sendSessionInquiryToSession(targetSessionId, text);
      return true;
    } catch (error) {
      clearSessionReplyPending(targetSessionId);
      console.error('Failed to start session response:', error);
      showToast('Couldn’t send this message. Try again.', 'info');
      return false;
    }
  }, [
    activeSessionSummary?.id,
    appendLocalSessionEvents,
    createSessionDraft,
    clearSessionReplyPending,
    defaultSessionTitle,
    hasPendingSessionReply,
    isComposingNewSession,
    markSessionReplyPending,
    refreshPersistedSessions,
    sessionUserId,
    sendSessionInquiryToSession,
    retryAuthenticationRequiredResponse,
    showToast,
    streamSessionInquiryResponse,
    sessionStreams,
    sessionSummaries,
  ]);

  return {
    createSessionDraft,
    appendSessionEvents,
    appendLocalSessionEvents,
    persistSessionArtworkInput,
    sendSessionInquiryToSession,
    retryAuthenticationRequiredResponse,
    handleSessionInquiry,
  };
}
