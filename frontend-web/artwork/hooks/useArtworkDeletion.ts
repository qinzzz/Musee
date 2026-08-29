import { useCallback } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { batchDeleteArtworks, deleteArtwork } from '../../api/artworks';
import { queryKeys } from '../../lib/queryClient';
import type { GalleryItem } from '../../types';
import type { ArtworkStatePatch } from '../lib/artworkState';

type ArtworkDeleteConfirmation =
  | { type: 'item'; id: string }
  | { type: 'items'; ids: string[]; count: number };

type UseArtworkDeletionOptions = {
  userId: string;
  items: GalleryItem[];
  queryClient: QueryClient;
  patchArtwork: (itemId: string, patch: ArtworkStatePatch) => void;
  removeArtworkLocally: (itemId: string) => void;
  clearArtworkDetailSelection: (itemId: string) => void;
  refreshArtworks: () => void;
  refreshProfileDerivedData: () => void;
  requestConfirmation: (confirmation: ArtworkDeleteConfirmation) => void;
  dismissConfirmation: () => void;
  showToast: (message: string, type?: 'info' | 'success') => void;
};

export function useArtworkDeletion({
  userId,
  items,
  queryClient,
  patchArtwork,
  removeArtworkLocally,
  clearArtworkDetailSelection,
  refreshArtworks,
  refreshProfileDerivedData,
  requestConfirmation,
  dismissConfirmation,
  showToast,
}: UseArtworkDeletionOptions) {
  const requestDeleteItem = useCallback((id: string) => {
    requestConfirmation({ id, type: 'item' });
  }, [requestConfirmation]);

  const requestDeleteItems = useCallback((itemIds: string[]) => {
    if (itemIds.length === 0) return;
    requestConfirmation({
      type: 'items',
      ids: itemIds,
      count: itemIds.length,
    });
  }, [requestConfirmation]);

  const performDeleteItems = useCallback(async (itemIds: string[]) => {
    const targetItems = itemIds
      .map((itemId) => items.find((item) => item.id === itemId))
      .filter((item): item is GalleryItem => Boolean(item));

    if (targetItems.length === 0) {
      dismissConfirmation();
      return;
    }

    targetItems.forEach((item) => {
      patchArtwork(item.id, {
        clientState: {
          deleteStatus: 'pending',
        },
      });
    });

    try {
      if (targetItems.length === 1) {
        const targetItem = targetItems[0];
        clearArtworkDetailSelection(targetItem.id);
        await deleteArtwork(targetItem.artworkId || targetItem.id, userId);
      } else {
        await batchDeleteArtworks(
          targetItems.map((item) => item.artworkId || item.id),
          userId,
        );
      }

      targetItems.forEach((item) => {
        removeArtworkLocally(item.id);
      });
      refreshArtworks();
      refreshProfileDerivedData();
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessionEventsRoot() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.artists(userId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.accountUsage(userId) });
      showToast(
        targetItems.length === 1 ? 'Removed from collection' : `Removed ${targetItems.length} artworks from collection`,
        'success',
      );
      console.log(`Successfully removed artworks from collection: ${targetItems.map((item) => item.id).join(', ')}`);
    } catch (error) {
      console.error('Failed to delete artworks:', error);
      targetItems.forEach((item) => {
        patchArtwork(item.id, {
          clientState: {
            deleteStatus: undefined,
          },
        });
      });
      showToast(targetItems.length === 1 ? 'Could not remove artwork' : 'Could not remove artworks', 'info');
      throw error;
    }
  }, [
    clearArtworkDetailSelection,
    dismissConfirmation,
    items,
    patchArtwork,
    queryClient,
    refreshArtworks,
    refreshProfileDerivedData,
    removeArtworkLocally,
    showToast,
    userId,
  ]);

  const confirmDeleteItem = useCallback(async (id: string) => {
    dismissConfirmation();
    await performDeleteItems([id]);
  }, [dismissConfirmation, performDeleteItems]);

  const confirmDeleteItems = useCallback(async (ids: string[]) => {
    dismissConfirmation();
    await performDeleteItems(ids);
  }, [dismissConfirmation, performDeleteItems]);

  return {
    requestDeleteItem,
    requestDeleteItems,
    confirmDeleteItem,
    confirmDeleteItems,
  };
}
