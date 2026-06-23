import { useMemo, useState } from 'react';
import type { GalleryItem } from '../../types';
import type { PendingSessionArtwork } from '../types';

type ToastType = 'info' | 'success';
type ShowToast = (message: string, type?: ToastType) => void;

type UsePreparedSessionStagingOptions = {
  items: GalleryItem[];
  showToast: ShowToast;
  maxArtworks?: number;
};

export function usePreparedSessionStaging({
  items,
  showToast,
  maxArtworks = 5,
}: UsePreparedSessionStagingOptions) {
  const [pendingSessionArtworks, setPendingSessionArtworks] = useState<PendingSessionArtwork[]>([]);
  const [newSessionDraftMessage, setNewSessionDraftMessage] = useState('');
  const [isLibraryPickerOpen, setIsLibraryPickerOpen] = useState(false);
  const [libraryPickerSearch, setLibraryPickerSearch] = useState('');
  const [isSubmittingPreparedSession, setIsSubmittingPreparedSession] = useState(false);

  const pendingLibraryArtworkIds = useMemo(
    () =>
      pendingSessionArtworks
        .filter((entry): entry is Extract<PendingSessionArtwork, { kind: 'library' }> => entry.kind === 'library')
        .map((entry) => entry.artwork.id),
    [pendingSessionArtworks],
  );

  const availableLibraryArtworks = useMemo(
    () =>
      items.filter((item) =>
        !item.isDeletedPlaceholder
        && !item.isAnalyzing
        && Boolean(item.url)
      ),
    [items],
  );

  const resetPreparedSessionState = () => {
    setPendingSessionArtworks([]);
    setNewSessionDraftMessage('');
    setIsLibraryPickerOpen(false);
    setLibraryPickerSearch('');
  };

  const stageLibraryArtworkForSession = (item: GalleryItem) => {
    setPendingSessionArtworks((prev) => {
      if (prev.some((entry) => entry.kind === 'library' && entry.artwork.id === item.id)) {
        return prev.filter((entry) => !(entry.kind === 'library' && entry.artwork.id === item.id));
      }
      if (prev.length >= maxArtworks) {
        showToast(`You can add up to ${maxArtworks} artworks to start a session.`, 'info');
        return prev;
      }
      return [
        ...prev,
        {
          id: `library-${item.id}`,
          kind: 'library',
          artwork: item,
          previewUrl: item.url,
          label: item.artworkName || 'Untitled',
          sublabel: item.artistName || item.photoTime || 'Saved artwork',
        },
      ];
    });
  };

  const removePendingSessionArtwork = (entryId: string) => {
    setPendingSessionArtworks((prev) => prev.filter((entry) => entry.id !== entryId));
  };

  return {
    pendingSessionArtworks,
    setPendingSessionArtworks,
    newSessionDraftMessage,
    setNewSessionDraftMessage,
    isLibraryPickerOpen,
    setIsLibraryPickerOpen,
    libraryPickerSearch,
    setLibraryPickerSearch,
    isSubmittingPreparedSession,
    setIsSubmittingPreparedSession,
    pendingLibraryArtworkIds,
    availableLibraryArtworks,
    resetPreparedSessionState,
    stageLibraryArtworkForSession,
    removePendingSessionArtwork,
  };
}
