import { useEffect, useState } from 'react';

import type { CollectTab } from '../../lib/appNavigation';
import type { GalleryItem } from '../../types';
import type { SavedLayout } from '../types';

type Params = {
  collectTab: CollectTab;
  savedLayout: SavedLayout;
  searchedSavedItems: GalleryItem[];
  items: GalleryItem[];
  onAddItemsToBoard: (boardId: string, itemIds: string[]) => Promise<void>;
  onDeleteArtworks: (itemIds: string[]) => void | Promise<void>;
};

export function useArtworkSelection({
  collectTab,
  savedLayout,
  searchedSavedItems,
  items,
  onAddItemsToBoard,
  onDeleteArtworks,
}: Params) {
  const [selectedArtworkIds, setSelectedArtworkIds] = useState<string[]>([]);
  const [isExplicitSelectionMode, setIsExplicitSelectionMode] = useState(false);
  const [isApplyingBoard, setIsApplyingBoard] = useState(false);
  const [isDeletingSelection, setIsDeletingSelection] = useState(false);

  useEffect(() => {
    if (collectTab !== 'saved' || savedLayout !== 'grid') {
      setSelectedArtworkIds([]);
      setIsExplicitSelectionMode(false);
    }
  }, [collectTab, savedLayout]);

  useEffect(() => {
    const searchableIds = new Set(
      searchedSavedItems.filter((item) => item.deleteStatus !== 'pending').map((item) => item.id),
    );
    setSelectedArtworkIds((prev) => prev.filter((id) => searchableIds.has(id)));
  }, [searchedSavedItems]);

  const toggleArtworkSelection = (itemId: string) => {
    const target = items.find((item) => item.id === itemId);
    if (target?.deleteStatus === 'pending') return;

    setSelectedArtworkIds((prev) => (
      prev.includes(itemId)
        ? prev.filter((id) => id !== itemId)
        : [...prev, itemId]
    ));
  };

  const clearArtworkSelection = () => {
    setSelectedArtworkIds([]);
    setIsExplicitSelectionMode(false);
  };

  const enterArtworkSelectionMode = () => {
    setIsExplicitSelectionMode(true);
  };

  const handleAddSelectionToBoard = async (boardId: string) => {
    if (!boardId || selectedArtworkIds.length === 0) return;

    try {
      setIsApplyingBoard(true);
      await onAddItemsToBoard(boardId, selectedArtworkIds);
      clearArtworkSelection();
    } finally {
      setIsApplyingBoard(false);
    }
  };

  const handleDeleteSelection = async () => {
    if (selectedArtworkIds.length === 0) return;

    setIsDeletingSelection(true);
    try {
      await onDeleteArtworks(selectedArtworkIds);
    } finally {
      setIsDeletingSelection(false);
    }
  };

  return {
    selectedArtworkIds,
    isArtworkSelectionMode: isExplicitSelectionMode || selectedArtworkIds.length > 0,
    isApplyingBoard,
    isDeletingSelection,
    toggleArtworkSelection,
    enterArtworkSelectionMode,
    clearArtworkSelection,
    handleAddSelectionToBoard,
    handleDeleteSelection,
  };
}
