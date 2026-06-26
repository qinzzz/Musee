import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { streamSessionChat } from '../../api/chat';
import type { GalleryItem, Visit } from '../../types';
import {
  appendSessionMessages as appendSessionMessagesApi,
  createSession,
  startSessionWithMessage,
} from '../api/sessions';
import { buildUploadCommentaryPrompt } from '../lib/commentary';
import { itemBelongsToSession } from '../lib/sessionLinks';
import { serializeSessionHistory } from '../lib/sessionHistory';
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
  sessionGoals: Record<string, string>;
  sessionSummaries: SessionSummary[];
  activeSessionSummary: SessionSummary | null;
  refreshPersistedSessions: () => void;
  setSessionDrafts: Dispatch<SetStateAction<SessionDraft[]>>;
  setFilteredSessionId: Dispatch<SetStateAction<string | null>>;
  setIsComposingNewSession: Dispatch<SetStateAction<boolean>>;
  setVisit: Dispatch<SetStateAction<Visit>>;
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

export function useSessionMessaging({
  defaultSessionTitle,
  sessionUserId,
  filteredSessionId,
  isComposingNewSession,
  items,
  sessionStreams,
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

  const appendSessionMessages = useCallback((sessionId: string, newMessages: SessionStreamMessage[]) => {
    setSessionStreams((prev) => ({
      ...prev,
      [sessionId]: [...(prev[sessionId] || []), ...newMessages],
    }));
    setSessionDrafts((prev) => {
      const nextUpdatedAt = newMessages[newMessages.length - 1]?.createdAt || Date.now();
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

    appendSessionMessagesApi(
      sessionId,
      newMessages.map((message) => {
        const isPlaceholder = message.type === 'artwork_capture' || message.type === 'artwork_card';
        return {
          id: message.id,
          role: message.role as 'user' | 'model',
          type: message.type || 'text',
          content: isPlaceholder ? undefined : message.text,
          artwork_id: message.artworkId,
          created_at: message.createdAt,
        };
      }),
    ).finally(() => {
      refreshPersistedSessions();
    });
  }, [
    defaultSessionTitle,
    refreshPersistedSessions,
    setSessionDrafts,
    setSessionStreams,
    sessionSummaries,
  ]);

  const streamSessionInquiryResponse = useCallback((
    targetSessionId: string,
    text: string,
    sessionItemsOverride?: GalleryItem[],
    historyOverride?: SessionStreamMessage[],
  ) => {
    setStreamingSessionResponses((prev) => ({ ...prev, [targetSessionId]: '' }));

    const existingMessages = historyOverride || sessionStreams[targetSessionId] || [];
    const sessionItems = sessionItemsOverride
      || (activeSessionSummary?.id === targetSessionId
        ? activeSessionSummary.items
        : items.filter((item) => itemBelongsToSession(item, targetSessionId)));

    streamSessionChat(
      sessionItems.map(toSessionChatArtwork),
      serializeSessionHistory(existingMessages, sessionItems),
      text,
      (chunk) => {
        setStreamingSessionResponses((prev) => ({
          ...prev,
          [targetSessionId]: (prev[targetSessionId] || '') + chunk,
        }));
      },
      (fullResponse) => {
        const assistantMsg: SessionStreamMessage = {
          id: `session-msg-${Date.now()}-assistant`,
          role: 'model',
          text: fullResponse,
          createdAt: Date.now(),
        };
        appendSessionMessages(targetSessionId, [assistantMsg]);
        setStreamingSessionResponses((prev) => {
          const next = { ...prev };
          delete next[targetSessionId];
          return next;
        });
      },
      () => {
        const assistantMsg: SessionStreamMessage = {
          id: `session-msg-${Date.now()}-error`,
          role: 'model',
          text: 'Something interrupted the reflection stream. Please try again.',
          createdAt: Date.now(),
        };
        appendSessionMessages(targetSessionId, [assistantMsg]);
        setStreamingSessionResponses((prev) => {
          const next = { ...prev };
          delete next[targetSessionId];
          return next;
        });
      },
    );
  }, [
    activeSessionSummary,
    appendSessionMessages,
    items,
    setStreamingSessionResponses,
    sessionStreams,
  ]);

  const sendSessionInquiryToSession = useCallback((
    targetSessionId: string,
    text: string,
    sessionItemsOverride?: GalleryItem[],
    options?: { persistUserMessage?: boolean },
  ) => {
    const existingMessages = sessionStreams[targetSessionId] || [];
    let nextHistory = existingMessages;

    if (options?.persistUserMessage !== false) {
      const createdAt = Date.now();
      const userMsg: SessionStreamMessage = {
        id: `session-msg-${createdAt}`,
        role: 'user',
        text,
        createdAt,
      };
      appendSessionMessages(targetSessionId, [userMsg]);
      nextHistory = [...existingMessages, userMsg];
    }

    streamSessionInquiryResponse(targetSessionId, text, sessionItemsOverride, nextHistory);
  }, [
    appendSessionMessages,
    streamSessionInquiryResponse,
    sessionStreams,
  ]);

  const triggerUploadCommentary = useCallback((
    sessionId: string,
    newArtworks: Array<Partial<Pick<GalleryItem, 'artistName' | 'artworkName'>>>,
    sessionItems: GalleryItem[],
    conversationHistory: SessionStreamMessage[],
  ) => {
    const trigger = buildUploadCommentaryPrompt(newArtworks, sessionGoals[sessionId]);
    if (!trigger) return;

    setStreamingSessionResponses((prev) => ({ ...prev, [sessionId]: '' }));

    streamSessionChat(
      sessionItems.map(toSessionChatArtwork),
      serializeSessionHistory(conversationHistory, sessionItems),
      trigger,
      (chunk) => {
        setStreamingSessionResponses((prev) => ({ ...prev, [sessionId]: (prev[sessionId] || '') + chunk }));
      },
      (fullResponse) => {
        const msg: SessionStreamMessage = {
          id: `commentary-${Date.now()}`,
          role: 'model',
          text: fullResponse,
          createdAt: Date.now(),
        };
        appendSessionMessages(sessionId, [msg]);
        setStreamingSessionResponses((prev) => {
          const next = { ...prev };
          delete next[sessionId];
          return next;
        });
      },
      () => {
        setStreamingSessionResponses((prev) => {
          const next = { ...prev };
          delete next[sessionId];
          return next;
        });
      },
    );
  }, [
    appendSessionMessages,
    sessionGoals,
    setStreamingSessionResponses,
  ]);

  const handleSessionInquiry = useCallback(async (text: string) => {
    let targetSessionId = activeSessionSummary?.id;
    if (!targetSessionId || isComposingNewSession) {
      targetSessionId = createSessionDraft();
    }

    const targetSummary = sessionSummaries.find((summary) => summary.id === targetSessionId);
    const shouldPersistSession = !targetSummary || targetSummary.items.length === 0;

    if (shouldPersistSession) {
      const createdAt = Date.now();
      const userMsg: SessionStreamMessage = {
        id: `session-msg-${createdAt}`,
        role: 'user',
        text,
        createdAt,
      };

      try {
        await startSessionWithMessage(sessionUserId, {
          session_id: targetSessionId,
          title: targetSummary?.title || defaultSessionTitle,
          message: {
            id: userMsg.id,
            role: 'user',
            type: 'text',
            content: text,
            created_at: createdAt,
          },
        });
        refreshPersistedSessions();
        appendSessionMessages(targetSessionId, [userMsg]);
        streamSessionInquiryResponse(targetSessionId, text, undefined, [...(sessionStreams[targetSessionId] || []), userMsg]);
      } catch (error) {
        console.error('Failed to commit first session message:', error);
        showToast('Couldn’t send your first message. Try again.', 'info');
        return false;
      }
      return true;
    }

    sendSessionInquiryToSession(targetSessionId, text);
    return true;
  }, [
    activeSessionSummary?.id,
    appendSessionMessages,
    createSessionDraft,
    defaultSessionTitle,
    ensureSessionRecord,
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
    appendSessionMessages,
    sendSessionInquiryToSession,
    triggerUploadCommentary,
    handleSessionInquiry,
  };
}
