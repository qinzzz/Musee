import { useMemo } from 'react';

import type { ArtistRow } from '../../api/artworks';
import type { Board } from '../../boards/types';
import type { CollectTab } from '../../lib/appNavigation';
import type { ArtworkClassification, GalleryItem } from '../../types';
import {
  filterArtistsBySearch,
  filterArtworksByCollectionSearch,
  filterBoardsBySearch,
  getCollectionSearchPlaceholder,
  getSavedContextLabel,
  groupArtworksByMonth,
} from '../lib/organizeView';
import type { ActiveFilter, SavedFilterOption } from '../types';

type Params = {
  items: GalleryItem[];
  likedIds?: Set<string>;
  boards: Board[];
  artists: ArtistRow[];
  collectTab: CollectTab;
  activeFilter: ActiveFilter;
  selectedBoard: 'liked' | string | null;
  normalizedCollectionSearch: string;
  artworksLoaded: boolean;
};

export function useCollectionViewModel({
  items,
  likedIds,
  boards,
  artists,
  collectTab,
  activeFilter,
  selectedBoard,
  normalizedCollectionSearch,
  artworksLoaded,
}: Params) {
  const likedItems = useMemo(() => items.filter((item) => likedIds?.has(item.id)), [items, likedIds]);

  const classificationCounts = useMemo(
    () =>
      items.reduce<Record<ArtworkClassification, number>>(
        (counts, item) => {
          const classification = item.classification || 'unsorted';
          counts[classification] += 1;
          return counts;
        },
        {
          unsorted: 0,
          love: 0,
          respect: 0,
          not_for_me: 0,
        },
      ),
    [items],
  );

  const showFilterBar = items.length > 0;

  const filteredItems = useMemo(() => {
    if (activeFilter === 'all') return items;
    return items.filter((item) => (item.classification || 'unsorted') === activeFilter);
  }, [items, activeFilter]);

  const searchedSavedItems = useMemo(
    () => filterArtworksByCollectionSearch(filteredItems, normalizedCollectionSearch),
    [filteredItems, normalizedCollectionSearch],
  );

  const groupedItems = useMemo(() => groupArtworksByMonth(searchedSavedItems), [searchedSavedItems]);

  const boardDetailItems = useMemo(() => {
    if (!selectedBoard) return [];
    if (selectedBoard === 'liked') return likedItems;
    const board = boards.find((entry) => entry.id === selectedBoard);
    return board ? items.filter((item) => board.itemIds.includes(item.id)) : [];
  }, [selectedBoard, likedItems, boards, items]);

  const searchedBoardDetailItems = useMemo(
    () => filterArtworksByCollectionSearch(boardDetailItems, normalizedCollectionSearch),
    [boardDetailItems, normalizedCollectionSearch],
  );

  const boardDetailName = useMemo(() => {
    if (!selectedBoard) return '';
    if (selectedBoard === 'liked') return 'Liked';
    return boards.find((entry) => entry.id === selectedBoard)?.name ?? '';
  }, [selectedBoard, boards]);

  const unsortedCount = useMemo(
    () => items.filter((item) => (item.classification || 'unsorted') === 'unsorted').length,
    [items],
  );

  const savedContextLabel = useMemo(() => getSavedContextLabel(activeFilter), [activeFilter]);

  const showSavedEmptyOverlay =
    searchedSavedItems.length === 0 && (Boolean(normalizedCollectionSearch) || activeFilter !== 'all');

  const showSavedLoadingSkeleton = !artworksLoaded && items.length === 0;

  const searchedBoards = useMemo(
    () => filterBoardsBySearch(boards, normalizedCollectionSearch),
    [boards, normalizedCollectionSearch],
  );

  const searchedArtists = useMemo(
    () => filterArtistsBySearch(artists, normalizedCollectionSearch),
    [artists, normalizedCollectionSearch],
  );

  const collectionSearchPlaceholder = useMemo(
    () => getCollectionSearchPlaceholder(collectTab, selectedBoard, boardDetailName),
    [boardDetailName, collectTab, selectedBoard],
  );

  const savedFilters: SavedFilterOption[] = [
    { id: 'all', label: 'All', count: items.length },
    { id: 'love', label: 'Loved', count: classificationCounts.love },
    { id: 'respect', label: 'Respect', count: classificationCounts.respect },
    { id: 'not_for_me', label: 'Not for Me', count: classificationCounts.not_for_me },
    { id: 'unsorted', label: 'Unsorted', count: classificationCounts.unsorted },
  ];

  return {
    likedItems,
    showFilterBar,
    searchedSavedItems,
    groupedItems,
    boardDetailItems,
    searchedBoardDetailItems,
    boardDetailName,
    unsortedCount,
    savedContextLabel,
    showSavedEmptyOverlay,
    showSavedLoadingSkeleton,
    searchedBoards,
    searchedArtists,
    collectionSearchPlaceholder,
    savedFilters,
  };
}
