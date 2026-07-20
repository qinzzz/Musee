import { useCallback, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { ArtworkWorkspace, GalleryItem, SessionLink } from '../../types';
import type { SessionStreamMessage } from '../types';
import { attachArtworksToSession } from '../api/sessions';
import { newSessionEventId } from '../lib/sessionLinks';
import { nextLocalOrder } from '../lib/sessionOrdering';
import {
  getNextLocalSessionEventCreatedAt,
  getNextSessionArtworkSequenceNumber,
} from '../../artwork-ingest/lib/uploadWorkflow';

type ToastType = 'info' | 'success';

type UseAttachLibraryArtworksOptions = {
  userId: string;
  items: GalleryItem[];
  sessionStreams: Record<string, SessionStreamMessage[]>;
  updateArtworkSessionLinks: (
    sessionId: string,
    resolveLink: (item: GalleryItem) => SessionLink | null | undefined,
  ) => void;
  appendSessionEvents: (
    sessionId: string,
    newMessages: SessionStreamMessage[],
    options?: { persist?: boolean },
  ) => void;
  persistSessionArtworkInput: (
    sessionId: string,
    artworks: Array<{ artworkId: string; source: 'upload' | 'capture' | 'library' }>,
    userInputEventId: string,
    content?: string,
  ) => Promise<void>;
  setVisit: Dispatch<SetStateAction<ArtworkWorkspace>>;
  refreshPersistedSessions: () => void;
  showToast: (message: string, type?: ToastType) => void;
};

// Selection + confirm flow for adding existing collection artworks to an
// ongoing session (the new-session composer uses the staging flow in
// usePreparedSessionStaging instead).
export function useAttachLibraryArtworks({
  userId,
  items,
  sessionStreams,
  updateArtworkSessionLinks,
  appendSessionEvents,
  persistSessionArtworkInput,
  setVisit,
  refreshPersistedSessions,
  showToast,
}: UseAttachLibraryArtworksOptions) {
  const [selection, setSelection] = useState<GalleryItem[]>([]);
  const [isAttaching, setIsAttaching] = useState(false);

  const selectedIds = useMemo(() => selection.map((item) => item.id), [selection]);

  const toggleSelect = useCallback((item: GalleryItem) => {
    setSelection((prev) => (
      prev.some((entry) => entry.id === item.id)
        ? prev.filter((entry) => entry.id !== item.id)
        : [...prev, item]
    ));
  }, []);

  const resetSelection = useCallback(() => {
    setSelection([]);
  }, []);

  const attachSelectionToSession = useCallback(async (sessionId: string) => {
    if (selection.length === 0 || isAttaching) return;

    setIsAttaching(true);
    try {
      const artworkIds = selection.map((item) => item.artworkId || item.id);
      await attachArtworksToSession(sessionId, userId, artworkIds);

      const startingSequenceNumber = getNextSessionArtworkSequenceNumber(items, sessionId);
      const sequenceByClientId = new Map(
        selection.map((item, index) => [item.id, startingSequenceNumber + index]),
      );
      updateArtworkSessionLinks(sessionId, (item) => {
        const sequenceNumber = sequenceByClientId.get(item.id);
        if (sequenceNumber === undefined) return undefined;
        return { sessionId, sequenceNumber, source: 'library' };
      });

      const userInputEventId = newSessionEventId();
      const history = sessionStreams[sessionId] || [];
      let createdAtCursor = getNextLocalSessionEventCreatedAt(history);
      const streamMessages: SessionStreamMessage[] = [];
      const inputEntries = selection.map((item) => ({
        artworkId: item.artworkId || item.id,
        source: 'library' as const,
      }));

      selection.forEach((item) => {
        const artworkId = item.artworkId || item.id;
        streamMessages.push(
          { id: `capture-${sessionId}-${artworkId}`, role: 'user', text: '', type: 'artwork_capture', artworkId, triggerEventId: userInputEventId, createdAt: createdAtCursor++, localOrder: nextLocalOrder() },
          { id: `card-${sessionId}-${artworkId}`, role: 'model', text: '', type: 'artwork_card', artworkId, triggerEventId: userInputEventId, createdAt: createdAtCursor++, localOrder: nextLocalOrder() },
        );
      });
      streamMessages.push({
        id: userInputEventId,
        role: 'user',
        text: '',
        artworkIds: inputEntries.map((entry) => entry.artworkId),
        payload: {
          artworks: inputEntries.map((entry) => ({
            artwork_id: entry.artworkId,
            source: entry.source,
          })),
        },
        triggerEventId: userInputEventId,
        createdAt: createdAtCursor++,
        localOrder: nextLocalOrder(),
      });

      appendSessionEvents(sessionId, streamMessages, { persist: false });
      void persistSessionArtworkInput(sessionId, inputEntries, userInputEventId);

      const attachedClientIds = selection.map((item) => item.id);
      setVisit((prev) => (
        prev.id === sessionId
          ? { ...prev, itemIds: [...prev.itemIds, ...attachedClientIds.filter((id) => !prev.itemIds.includes(id))] }
          : prev
      ));
      refreshPersistedSessions();
      showToast(
        selection.length === 1
          ? 'Added an artwork to this session'
          : `Added ${selection.length} artworks to this session`,
        'success',
      );
      resetSelection();
    } catch (error) {
      console.error('Failed to add artworks to session:', error);
      showToast('Couldn’t add artworks to this session. Try again.', 'info');
    } finally {
      setIsAttaching(false);
    }
  }, [
    appendSessionEvents,
    isAttaching,
    items,
    persistSessionArtworkInput,
    refreshPersistedSessions,
    resetSelection,
    selection,
    sessionStreams,
    setVisit,
    showToast,
    updateArtworkSessionLinks,
    userId,
  ]);

  return {
    selectedIds,
    isAttaching,
    toggleSelect,
    resetSelection,
    attachSelectionToSession,
  };
}
