import { useMemo, useState } from 'react';
import type { GalleryItem } from '../../types';
import type { PendingSessionArtwork } from '../types';
import { MAX_SESSION_ARTWORK_BATCH_SIZE } from '../constants';

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
  maxArtworks = MAX_SESSION_ARTWORK_BATCH_SIZE,
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

  // Replaces the staged library picks with the picker's confirmed selection,
  // preserving any staged uploads. Called once on "Add to chat" so selecting
  // inside the modal doesn't touch the tray until the user commits.
  const commitLibrarySelection = (selectedItems: GalleryItem[]) => {
    setPendingSessionArtworks((prev) => {
      const uploadEntries = prev.filter((entry) => entry.kind !== 'library');
      const remainingSlots = Math.max(0, maxArtworks - uploadEntries.length);
      const limited = selectedItems.slice(0, remainingSlots);
      if (limited.length < selectedItems.length) {
        showToast(`You can add up to ${maxArtworks} artworks at a time.`, 'info');
      }
      const libraryEntries: PendingSessionArtwork[] = limited.map((item) => ({
        id: `library-${item.id}`,
        kind: 'library',
        artwork: item,
        previewUrl: item.url,
        label: item.artworkName || 'Untitled',
        sublabel: item.artistName || item.photoTime || 'Saved artwork',
      }));
      return [...uploadEntries, ...libraryEntries];
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
    commitLibrarySelection,
    removePendingSessionArtwork,
  };
}
