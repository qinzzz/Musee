import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { visitChatStream } from '../../api/chat';
import type { GalleryItem, Visit } from '../../types';
import { appendSessionMessages, createSession, startSessionWithMessage } from '../api/sessions';
import { buildUploadCommentaryPrompt } from '../lib/commentary';
import { itemBelongsToSession } from '../lib/sessionLinks';
import { serializeVisitHistory } from '../lib/visitMessaging';
import type { VisitDraft, VisitStreamMessage, VisitSummary } from '../types';

type ToastType = 'info' | 'success';
type ShowToast = (message: string, type?: ToastType) => void;

type UseSessionMessagingOptions = {
  defaultVisitTitle: string;
  sessionUserId: string;
  filteredVisitId: string | null;
  isComposingNewSession: boolean;
  items: GalleryItem[];
  visitStreams: Record<string, VisitStreamMessage[]>;
  sessionGoals: Record<string, string>;
  visitSummaries: VisitSummary[];
  activeVisitSummary: VisitSummary | null;
  refreshPersistedSessions: () => void;
  setVisitDrafts: Dispatch<SetStateAction<VisitDraft[]>>;
  setFilteredVisitId: Dispatch<SetStateAction<string | null>>;
  setIsComposingNewSession: Dispatch<SetStateAction<boolean>>;
  setVisit: Dispatch<SetStateAction<Visit>>;
  setVisitStreams: Dispatch<SetStateAction<Record<string, VisitStreamMessage[]>>>;
  setStreamingVisitResponses: Dispatch<SetStateAction<Record<string, string>>>;
  showToast: ShowToast;
};

const toVisitChatArtwork = (item: GalleryItem) => ({
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
  defaultVisitTitle,
  sessionUserId,
  filteredVisitId,
  isComposingNewSession,
  items,
  visitStreams,
  sessionGoals,
  visitSummaries,
  activeVisitSummary,
  refreshPersistedSessions,
  setVisitDrafts,
  setFilteredVisitId,
  setIsComposingNewSession,
  setVisit,
  setVisitStreams,
  setStreamingVisitResponses,
  showToast,
}: UseSessionMessagingOptions) {
  const createVisitDraft = useCallback(() => {
    const now = Date.now();
    const newVisit: VisitDraft = {
      id: `visit_${Math.random().toString(36).substring(2, 11)}`,
      title: defaultVisitTitle,
      createdAt: now,
      updatedAt: now,
    };
    setVisitDrafts((prev) => [newVisit, ...prev.filter((visit) => visit.id !== newVisit.id)]);
    setFilteredVisitId(newVisit.id);
    setIsComposingNewSession(false);
    setVisit({
      id: newVisit.id,
      itemIds: [],
      globalConversation: [],
    });
    return newVisit.id;
  }, [
    defaultVisitTitle,
    setFilteredVisitId,
    setIsComposingNewSession,
    setVisit,
    setVisitDrafts,
  ]);

  const ensureSessionRecord = useCallback(async (sessionId: string) => {
    const summary = visitSummaries.find((visitSummary) => visitSummary.id === sessionId);
    const response = await createSession(sessionUserId, sessionId, summary?.title || defaultVisitTitle);
    refreshPersistedSessions();
    return response;
  }, [
    defaultVisitTitle,
    refreshPersistedSessions,
    sessionUserId,
    visitSummaries,
  ]);

  const resolveUploadSession = useCallback(() => {
    if (filteredVisitId) {
      return { visitId: filteredVisitId, isNew: false };
    }

    const visitId = createVisitDraft();
    return { visitId, isNew: true };
  }, [createVisitDraft, filteredVisitId]);

  const appendVisitMessages = useCallback((visitId: string, newMessages: VisitStreamMessage[]) => {
    setVisitStreams((prev) => ({
      ...prev,
      [visitId]: [...(prev[visitId] || []), ...newMessages],
    }));
    setVisitDrafts((prev) => {
      const nextUpdatedAt = newMessages[newMessages.length - 1]?.createdAt || Date.now();
      const existingDraft = prev.find((draft) => draft.id === visitId);
      if (existingDraft) {
        return prev.map((draft) =>
          draft.id === visitId ? { ...draft, updatedAt: nextUpdatedAt } : draft,
        );
      }
      const summary = visitSummaries.find((visitSummary) => visitSummary.id === visitId);
      return [
        {
          id: visitId,
          title: summary?.title || defaultVisitTitle,
          createdAt: nextUpdatedAt,
          updatedAt: nextUpdatedAt,
        },
        ...prev,
      ];
    });

    appendSessionMessages(
      visitId,
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
    defaultVisitTitle,
    refreshPersistedSessions,
    setVisitDrafts,
    setVisitStreams,
    visitSummaries,
  ]);

  const streamVisitInquiryResponse = useCallback((
    targetVisitId: string,
    text: string,
    visitItemsOverride?: GalleryItem[],
    historyOverride?: VisitStreamMessage[],
  ) => {
    setStreamingVisitResponses((prev) => ({ ...prev, [targetVisitId]: '' }));

    const existingMessages = historyOverride || visitStreams[targetVisitId] || [];
    const visitItems = visitItemsOverride
      || (activeVisitSummary?.id === targetVisitId
        ? activeVisitSummary.items
        : items.filter((item) => itemBelongsToSession(item, targetVisitId)));

    visitChatStream(
      visitItems.map(toVisitChatArtwork),
      serializeVisitHistory(existingMessages, visitItems),
      text,
      (chunk) => {
        setStreamingVisitResponses((prev) => ({
          ...prev,
          [targetVisitId]: (prev[targetVisitId] || '') + chunk,
        }));
      },
      (fullResponse) => {
        const assistantMsg: VisitStreamMessage = {
          id: `visit-msg-${Date.now()}-assistant`,
          role: 'model',
          text: fullResponse,
          createdAt: Date.now(),
        };
        appendVisitMessages(targetVisitId, [assistantMsg]);
        setStreamingVisitResponses((prev) => {
          const next = { ...prev };
          delete next[targetVisitId];
          return next;
        });
      },
      () => {
        const assistantMsg: VisitStreamMessage = {
          id: `visit-msg-${Date.now()}-error`,
          role: 'model',
          text: 'Something interrupted the reflection stream. Please try again.',
          createdAt: Date.now(),
        };
        appendVisitMessages(targetVisitId, [assistantMsg]);
        setStreamingVisitResponses((prev) => {
          const next = { ...prev };
          delete next[targetVisitId];
          return next;
        });
      },
    );
  }, [
    activeVisitSummary,
    appendVisitMessages,
    items,
    setStreamingVisitResponses,
    visitStreams,
  ]);

  const sendVisitInquiryToSession = useCallback((
    targetVisitId: string,
    text: string,
    visitItemsOverride?: GalleryItem[],
    options?: { persistUserMessage?: boolean },
  ) => {
    const existingMessages = visitStreams[targetVisitId] || [];
    let nextHistory = existingMessages;

    if (options?.persistUserMessage !== false) {
      const createdAt = Date.now();
      const userMsg: VisitStreamMessage = {
        id: `visit-msg-${createdAt}`,
        role: 'user',
        text,
        createdAt,
      };
      appendVisitMessages(targetVisitId, [userMsg]);
      nextHistory = [...existingMessages, userMsg];
    }

    streamVisitInquiryResponse(targetVisitId, text, visitItemsOverride, nextHistory);
  }, [
    appendVisitMessages,
    streamVisitInquiryResponse,
    visitStreams,
  ]);

  const triggerUploadCommentary = useCallback((
    visitId: string,
    newArtworks: Array<Partial<Pick<GalleryItem, 'artistName' | 'artworkName'>>>,
    sessionItems: GalleryItem[],
    conversationHistory: VisitStreamMessage[],
  ) => {
    const trigger = buildUploadCommentaryPrompt(newArtworks, sessionGoals[visitId]);
    if (!trigger) return;

    setStreamingVisitResponses((prev) => ({ ...prev, [visitId]: '' }));

    visitChatStream(
      sessionItems.map(toVisitChatArtwork),
      serializeVisitHistory(conversationHistory, sessionItems),
      trigger,
      (chunk) => {
        setStreamingVisitResponses((prev) => ({ ...prev, [visitId]: (prev[visitId] || '') + chunk }));
      },
      (fullResponse) => {
        const msg: VisitStreamMessage = {
          id: `commentary-${Date.now()}`,
          role: 'model',
          text: fullResponse,
          createdAt: Date.now(),
        };
        appendVisitMessages(visitId, [msg]);
        setStreamingVisitResponses((prev) => {
          const next = { ...prev };
          delete next[visitId];
          return next;
        });
      },
      () => {
        setStreamingVisitResponses((prev) => {
          const next = { ...prev };
          delete next[visitId];
          return next;
        });
      },
    );
  }, [
    appendVisitMessages,
    sessionGoals,
    setStreamingVisitResponses,
  ]);

  const handleVisitInquiry = useCallback(async (text: string) => {
    let targetVisitId = activeVisitSummary?.id;
    if (!targetVisitId || isComposingNewSession) {
      targetVisitId = createVisitDraft();
    }

    const targetSummary = visitSummaries.find((summary) => summary.id === targetVisitId);
    const shouldPersistSession = !targetSummary || targetSummary.items.length === 0;

    if (shouldPersistSession) {
      const createdAt = Date.now();
      const userMsg: VisitStreamMessage = {
        id: `visit-msg-${createdAt}`,
        role: 'user',
        text,
        createdAt,
      };

      try {
        await startSessionWithMessage(sessionUserId, {
          session_id: targetVisitId,
          title: targetSummary?.title || defaultVisitTitle,
          message: {
            id: userMsg.id,
            role: 'user',
            type: 'text',
            content: text,
            created_at: createdAt,
          },
        });
        refreshPersistedSessions();
        appendVisitMessages(targetVisitId, [userMsg]);
        streamVisitInquiryResponse(targetVisitId, text, undefined, [...(visitStreams[targetVisitId] || []), userMsg]);
      } catch (error) {
        console.error('Failed to commit first session message:', error);
        showToast('Couldn’t send your first message. Try again.', 'info');
        return false;
      }
      return true;
    }

    sendVisitInquiryToSession(targetVisitId, text);
    return true;
  }, [
    activeVisitSummary?.id,
    appendVisitMessages,
    createVisitDraft,
    defaultVisitTitle,
    ensureSessionRecord,
    isComposingNewSession,
    refreshPersistedSessions,
    sessionUserId,
    sendVisitInquiryToSession,
    showToast,
    streamVisitInquiryResponse,
    visitStreams,
    visitSummaries,
  ]);

  return {
    createVisitDraft,
    ensureSessionRecord,
    resolveUploadSession,
    appendVisitMessages,
    sendVisitInquiryToSession,
    triggerUploadCommentary,
    handleVisitInquiry,
  };
}
