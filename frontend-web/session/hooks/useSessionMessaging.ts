import { useCallback, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { streamSessionChat } from '../../api/chat';
import type { ArtworkWorkspace, GalleryItem } from '../../types';
import {
  appendSessionEvents as appendSessionEventsApi,
  createSession,
  startSessionWithEvent,
  updateSessionEvent,
} from '../api/sessions';
import { buildUploadCommentaryPrompt } from '../lib/commentary';
import { itemBelongsToSession, newSessionEventId } from '../lib/sessionLinks';
import { getSessionHistoryBeforeTrigger, serializeSessionHistory } from '../lib/sessionHistory';
import { compareSessionEvents, nextLocalOrder } from '../lib/sessionOrdering';
import type { SessionDraft, SessionStreamMessage, SessionSummary } from '../types';

type ToastType = 'info' | 'success';
type ShowToast = (message: string, type?: ToastType) => void;

type UseSessionMessagingOptions = {
  defaultSessionTitle: string;
  sessionUserId: string;
  filteredSessionId: string | null;
  isComposingNewSession: boolean;
  items: GalleryItem[];
  sessionStreams: Record<string, SessionStreamMessage[]>;
  streamingSessionResponses: Record<string, string>;
  sessionGoals: Record<string, string>;
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
  filteredSessionId,
  isComposingNewSession,
  items,
  sessionStreams,
  streamingSessionResponses,
  sessionGoals,
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
  const hasPendingSessionReply = useCallback((sessionId: string | null | undefined) => (
    Boolean(sessionId && Object.prototype.hasOwnProperty.call(streamingSessionResponses, sessionId))
  ), [streamingSessionResponses]);

  const enqueueSessionEventWrite = useCallback(<T,>(
    sessionId: string,
    task: () => Promise<T>,
  ): Promise<T> => {
    const previous = sessionEventWriteQueuesRef.current[sessionId] || Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(task);
    sessionEventWriteQueuesRef.current[sessionId] = next.finally(() => {
      if (sessionEventWriteQueuesRef.current[sessionId] === next) {
        delete sessionEventWriteQueuesRef.current[sessionId];
      }
    });
    return next;
  }, []);

  const createSessionDraft = useCallback(() => {
    const now = Date.now();
    const newSession: SessionDraft = {
      id: `session_${Math.random().toString(36).substring(2, 11)}`,
      title: defaultSessionTitle,
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

  const ensureSessionRecord = useCallback(async (sessionId: string) => {
    const summary = sessionSummaries.find((sessionSummary) => sessionSummary.id === sessionId);
    const response = await createSession(sessionUserId, sessionId, summary?.title || defaultSessionTitle);
    refreshPersistedSessions();
    return response;
  }, [
    defaultSessionTitle,
    refreshPersistedSessions,
    sessionUserId,
    sessionSummaries,
  ]);

  const resolveUploadSession = useCallback(() => {
    if (filteredSessionId) {
      return { sessionId: filteredSessionId, isNew: false };
    }

    const sessionId = createSessionDraft();
    return { sessionId, isNew: true };
  }, [createSessionDraft, filteredSessionId]);

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
            event_type: event.type === 'artwork_commentary'
              ? 'artwork_commentary'
              : undefined,
            content: isPlaceholder ? undefined : event.text,
            artwork_id: event.artworkId,
            artwork_ids: event.artworkIds,
            trigger_event_id: event.role === 'user' ? undefined : event.triggerEventId,
            payload: event.type === 'artwork_commentary'
              ? { status: 'completed' }
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
    void persistSessionEvents(sessionId, newEvents);
  }, [
    appendLocalSessionEvents,
    persistSessionEvents,
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

  const persistPendingCommentary = useCallback((
    sessionId: string,
    commentaryId: string,
    artworkIds: string[],
    createdAt: number,
    parentEventId?: string,
  ) => (
    enqueueSessionEventWrite(sessionId, () => (
      appendSessionEventsApi(sessionId, [{
        id: commentaryId,
        role: 'model',
        event_type: 'artwork_commentary',
        artwork_ids: artworkIds,
        trigger_event_id: parentEventId,
        payload: { status: 'pending' },
        created_at: createdAt,
      }]).finally(() => {
        refreshPersistedSessions();
      })
    ))
  ), [enqueueSessionEventWrite, refreshPersistedSessions]);

  const finalizeCommentary = useCallback(async (
    sessionId: string,
    commentaryId: string,
    artworkIds: string[],
    status: 'completed' | 'failed',
    parentEventId?: string,
    options?: { content?: string; errorMessage?: string },
  ) => {
    const messagePayload = {
      role: 'model' as const,
      event_type: 'artwork_commentary' as const,
      content: options?.content,
      artwork_ids: artworkIds,
      trigger_event_id: parentEventId,
      payload: {
        status,
        ...(options?.errorMessage ? { error_message: options.errorMessage } : {}),
      },
    };

    await enqueueSessionEventWrite(sessionId, async () => {
      try {
        await updateSessionEvent(sessionId, commentaryId, messagePayload);
      } catch (_error) {
        await appendSessionEventsApi(sessionId, [{
          id: commentaryId,
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
  ) => {
    setStreamingSessionResponses((prev) => ({ ...prev, [targetSessionId]: '' }));

    const existingMessages = historyOverride || sessionStreams[targetSessionId] || [];
    const historyForPrompt = getSessionHistoryBeforeTrigger(existingMessages, parentEventIdOverride);
    const sessionItems = sessionItemsOverride
      || (activeSessionSummary?.id === targetSessionId
        ? activeSessionSummary.items
        : items.filter((item) => itemBelongsToSession(item, targetSessionId)));
    const commentaryId = `commentary-${Date.now()}`;
    const commentaryCreatedAt = getNextLocalEventCreatedAt(existingMessages);
    const commentaryArtworkIds = getSessionArtworkIds(sessionItems);
    const parentEventId = parentEventIdOverride;
    const pendingCommentaryMessage: SessionStreamMessage = {
      id: commentaryId,
      role: 'model',
      text: '',
      type: 'artwork_commentary',
      artworkIds: commentaryArtworkIds,
      triggerEventId: parentEventId,
      createdAt: commentaryCreatedAt,
      localOrder: nextLocalOrder(),
      payload: { status: 'pending' },
    };

    appendSessionEvents(targetSessionId, [pendingCommentaryMessage], { persist: false });

    void persistPendingCommentary(
      targetSessionId,
      commentaryId,
      commentaryArtworkIds,
      commentaryCreatedAt,
      parentEventId,
    );

    streamSessionChat(
      sessionItems.map(toSessionChatArtwork),
      serializeSessionHistory(historyForPrompt, sessionItems),
      text,
      (chunk) => {
        updateLocalSessionEvent(targetSessionId, commentaryId, (event) => ({
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
        updateLocalSessionEvent(targetSessionId, commentaryId, (event) => ({
          ...event,
          text: fullResponse,
          payload: {
            ...(event.payload || {}),
            status: 'completed',
          },
        }));
        void finalizeCommentary(
          targetSessionId,
          commentaryId,
          commentaryArtworkIds,
          'completed',
          parentEventId,
          { content: fullResponse },
        );
        setStreamingSessionResponses((prev) => {
          const next = { ...prev };
          delete next[targetSessionId];
          return next;
        });
      },
      () => {
        updateLocalSessionEvent(targetSessionId, commentaryId, (event) => ({
          ...event,
          payload: {
            ...(event.payload || {}),
            status: 'failed',
            error_message: 'Something interrupted the reflection stream. Please try again.',
          },
        }));
        void finalizeCommentary(
          targetSessionId,
          commentaryId,
          commentaryArtworkIds,
          'failed',
          parentEventId,
          { errorMessage: 'Something interrupted the reflection stream. Please try again.' },
        );
        setStreamingSessionResponses((prev) => {
          const next = { ...prev };
          delete next[targetSessionId];
          return next;
        });
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
    items,
    sessionUserId,
    setStreamingSessionResponses,
    sessionStreams,
    updateLocalSessionEvent,
  ]);

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

  const triggerUploadCommentary = useCallback((
    sessionId: string,
    newArtworks: Array<Partial<Pick<GalleryItem, 'artistName' | 'artworkName'>>>,
    sessionItems: GalleryItem[],
    conversationHistory: SessionStreamMessage[],
    parentEventId?: string,
  ) => {
    const trigger = buildUploadCommentaryPrompt(newArtworks, sessionGoals[sessionId]);
    if (!trigger) return;

    setStreamingSessionResponses((prev) => ({ ...prev, [sessionId]: '' }));
    const historyForPrompt = getSessionHistoryBeforeTrigger(conversationHistory, parentEventId);
    const commentaryId = `commentary-${Date.now()}`;
    const commentaryCreatedAt = getNextLocalEventCreatedAt(conversationHistory);
    const commentaryArtworkIds = getSessionArtworkIds(sessionItems);
    const pendingCommentaryMessage: SessionStreamMessage = {
      id: commentaryId,
      role: 'model',
      text: '',
      type: 'artwork_commentary',
      artworkIds: commentaryArtworkIds,
      triggerEventId: parentEventId,
      createdAt: commentaryCreatedAt,
      localOrder: nextLocalOrder(),
      payload: { status: 'pending' },
    };

    appendSessionEvents(sessionId, [pendingCommentaryMessage], { persist: false });

    void persistPendingCommentary(
      sessionId,
      commentaryId,
      commentaryArtworkIds,
      commentaryCreatedAt,
      parentEventId,
    );

    streamSessionChat(
      sessionItems.map(toSessionChatArtwork),
      serializeSessionHistory(historyForPrompt, sessionItems),
      trigger,
      (chunk) => {
        updateLocalSessionEvent(sessionId, commentaryId, (event) => ({
          ...event,
          text: `${event.text || ''}${chunk}`,
          payload: {
            ...(event.payload || {}),
            status: 'pending',
          },
        }));
        setStreamingSessionResponses((prev) => ({ ...prev, [sessionId]: (prev[sessionId] || '') + chunk }));
      },
      (fullResponse) => {
        updateLocalSessionEvent(sessionId, commentaryId, (event) => ({
          ...event,
          text: fullResponse,
          payload: {
            ...(event.payload || {}),
            status: 'completed',
          },
        }));
        void finalizeCommentary(
          sessionId,
          commentaryId,
          commentaryArtworkIds,
          'completed',
          parentEventId,
          { content: fullResponse },
        );
        setStreamingSessionResponses((prev) => {
          const next = { ...prev };
          delete next[sessionId];
          return next;
        });
      },
      () => {
        updateLocalSessionEvent(sessionId, commentaryId, (event) => ({
          ...event,
          payload: {
            ...(event.payload || {}),
            status: 'failed',
            error_message: 'Something interrupted the reflection stream. Please try again.',
          },
        }));
        void finalizeCommentary(
          sessionId,
          commentaryId,
          commentaryArtworkIds,
          'failed',
          parentEventId,
          { errorMessage: 'Something interrupted the reflection stream. Please try again.' },
        );
        setStreamingSessionResponses((prev) => {
          const next = { ...prev };
          delete next[sessionId];
          return next;
        });
      },
      {
        userId: sessionUserId,
        sessionId,
        triggerEventId: parentEventId,
      },
    );
  }, [
    appendSessionEvents,
    sessionUserId,
    sessionGoals,
    setStreamingSessionResponses,
    updateLocalSessionEvent,
  ]);

  const handleSessionInquiry = useCallback(async (text: string) => {
    let targetSessionId = activeSessionSummary?.id;
    if (!targetSessionId || isComposingNewSession) {
      targetSessionId = createSessionDraft();
    }

    if (hasPendingSessionReply(targetSessionId)) {
      return false;
    }

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

      try {
        await startSessionWithEvent(sessionUserId, {
          session_id: targetSessionId,
          title: targetSummary?.title || defaultSessionTitle,
          event: {
            id: userMsg.id,
            role: 'user',
            event_type: 'user_input',
            content: text,
            created_at: createdAt,
          },
        });
        refreshPersistedSessions();
        appendSessionEvents(targetSessionId, [userMsg]);
        streamSessionInquiryResponse(
          targetSessionId,
          text,
          undefined,
          [...(sessionStreams[targetSessionId] || []), userMsg],
          userEventId,
        );
      } catch (error) {
        console.error('Failed to commit first session event:', error);
        showToast('Couldn’t send your first message. Try again.', 'info');
        return false;
      }
      return true;
    }

    sendSessionInquiryToSession(targetSessionId, text);
    return true;
  }, [
    activeSessionSummary?.id,
    appendSessionEvents,
    createSessionDraft,
    defaultSessionTitle,
    hasPendingSessionReply,
    isComposingNewSession,
    refreshPersistedSessions,
    sessionUserId,
    sendSessionInquiryToSession,
    showToast,
    streamSessionInquiryResponse,
    sessionStreams,
    sessionSummaries,
  ]);

  return {
    createSessionDraft,
    ensureSessionRecord,
    resolveUploadSession,
    appendSessionEvents,
    appendLocalSessionEvents,
    persistSessionArtworkInput,
    sendSessionInquiryToSession,
    triggerUploadCommentary,
    handleSessionInquiry,
  };
}
