
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { GalleryItem, Visit, ArtworkClassification } from '../types';
import { type ArtistRow, type SmartCollection } from '../api/artworks';
import type { Board } from '../boards/types';
import GridView from './GridView';
import CreateBoardModal from './CreateBoardModal';
import ConfirmBoardDeleteModal from './ConfirmBoardDeleteModal';
import CollectionGridSkeleton from './CollectionGridSkeleton';
import { Button } from './ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';
import { buildArtistInvalidationKey, useUserArtists } from '../artist/hooks/useUserArtists';
import { SUPPORTED_UPLOAD_ACCEPT } from '../lib/uploadValidation';

const OverflowDotsIcon: React.FC<{ className?: string }> = ({ className = 'h-3.5 w-3.5' }) => (
  <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden="true">
    <circle cx="3" cy="8" r="1.25" />
    <circle cx="8" cy="8" r="1.25" />
    <circle cx="13" cy="8" r="1.25" />
  </svg>
);

const ARTIST_CARD_MEDIA_HEIGHT = 'h-[200px] sm:h-[220px]';

const BoardCoverMosaic: React.FC<{ covers: string[] }> = ({ covers }) => {
  const slots = [covers[0] ?? null, covers[1] ?? null, covers[2] ?? null] as const;

  return (
    <div className="grid aspect-square grid-cols-[1.35fr_1fr] grid-rows-2 gap-0.5 overflow-hidden rounded-xl bg-[var(--color-border)] mb-2.5">
      {slots.map((cover, index) => {
        const slotClassName =
          index === 0
            ? 'row-span-2 h-full'
            : 'h-full';

        return cover ? (
          <img
            key={index}
            src={cover}
            alt=""
            className={`${slotClassName} w-full object-cover`}
          />
        ) : (
          <div
            key={index}
            className={`${slotClassName} bg-[var(--color-bg-tertiary)]`}
            aria-hidden="true"
          />
        );
      })}
    </div>
  );
};

const ArtistArtworkCluster: React.FC<{ works: GalleryItem[] }> = ({ works }) => {
  const visibleWorks = works.slice(0, 3);

  if (visibleWorks.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-[18px] bg-[var(--color-bg-tertiary)] text-neutral-300">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="M21 15l-5-5L5 21" />
        </svg>
      </div>
    );
  }

  if (visibleWorks.length === 1) {
    const [work] = visibleWorks;
    return (
      <div className="h-full min-h-0 overflow-hidden rounded-[18px] bg-[var(--color-bg-tertiary)]">
        <img src={work.url} alt={work.artworkName || work.artistName || ''} className="block h-full w-full object-cover" />
      </div>
    );
  }

  if (visibleWorks.length === 2) {
    return (
      <div className="grid h-full min-h-0 grid-rows-2 gap-1.5">
        {visibleWorks.map((work) => (
          <div key={work.id} className="min-h-0 overflow-hidden rounded-[18px] bg-[var(--color-bg-tertiary)]">
            <img src={work.url} alt={work.artworkName || work.artistName || ''} className="block h-full w-full object-cover" />
          </div>
        ))}
      </div>
    );
  }

  const [first, second, third] = visibleWorks;
  return (
    <div className="grid h-full min-h-0 grid-cols-2 grid-rows-[1.2fr_0.9fr] gap-1.5">
      <div className="col-span-2 min-h-0 overflow-hidden rounded-[18px] bg-[var(--color-bg-tertiary)]">
        <img src={first.url} alt={first.artworkName || first.artistName || ''} className="block h-full w-full object-cover" />
      </div>
      <div className="min-h-0 overflow-hidden rounded-[18px] bg-[var(--color-bg-tertiary)]">
        <img src={second.url} alt={second.artworkName || second.artistName || ''} className="block h-full w-full object-cover" />
      </div>
      <div className="min-h-0 overflow-hidden rounded-[18px] bg-[var(--color-bg-tertiary)]">
        <img src={third.url} alt={third.artworkName || third.artistName || ''} className="block h-full w-full object-cover" />
      </div>
    </div>
  );
};

export type CollectTab = 'saved' | 'boards' | 'artists';
type SavedLayout = 'grid' | 'grouped';
type ActiveFilter = 'all' | ArtworkClassification;

interface Props {
  topBarLeftSlot?: React.ReactNode;
  onFileUpload: (event: React.ChangeEvent<HTMLInputElement>, mode: 'gallery' | 'camera') => void;
  artworksLoaded: boolean;
  items: GalleryItem[];
  visit: Visit;
  filteredSessionId: string | null;
  isAnalyzing: boolean;
  likedIds?: Set<string>;
  boards?: Board[];
  boardsLoading?: boolean;
  userId?: string | null;
  collectTab: CollectTab;
  onCollectTabChange: (tab: CollectTab) => void;
  onCreateBoard: (name: string, itemIds?: string[]) => Promise<Board>;
  onRenameBoard: (boardId: string, name: string) => Promise<Board>;
  onDeleteBoard: (boardId: string) => Promise<void>;
  onAddItemsToBoard: (boardId: string, itemIds: string[]) => Promise<void>;
  onOpenArtist: (artistEntityId: string, artistName: string) => void;
  onOpenMovement: (collection: SmartCollection) => void;
  onInterpret: (item: GalleryItem, context?: { items: GalleryItem[]; label: string }) => void;
  onDelete: (id: string) => void;
  onStartUnsortedFlow: () => void;
}

const OrganizeView: React.FC<Props> = ({
  topBarLeftSlot,
  onFileUpload,
  artworksLoaded,
  items, visit, filteredSessionId, isAnalyzing,
  likedIds, boards, boardsLoading, userId,
  collectTab, onCollectTabChange,
  onCreateBoard,
  onRenameBoard,
  onDeleteBoard,
  onAddItemsToBoard,
  onOpenArtist, onOpenMovement,
  onInterpret, onDelete,
  onStartUnsortedFlow,
}) => {
  const [savedLayout, setSavedLayout] = useState<SavedLayout>('grid');
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('all');
  const [collectionSearch, setCollectionSearch] = useState('');
  const [selectedBoard, setSelectedBoard] = useState<'liked' | string | null>(null);
  const [newBoardName, setNewBoardName] = useState('');
  const [isSubmittingBoard, setIsSubmittingBoard] = useState(false);
  const [createBoardRequest, setCreateBoardRequest] = useState<{
    itemIds?: string[];
    onCreated?: (board: Board) => void;
  } | null>(null);
  const [renameBoardTarget, setRenameBoardTarget] = useState<Board | null>(null);
  const [deleteBoardTarget, setDeleteBoardTarget] = useState<Board | null>(null);
  const [selectedArtworkIds, setSelectedArtworkIds] = useState<string[]>([]);
  const [isApplyingBoard, setIsApplyingBoard] = useState(false);
  const collectionUploadInputRef = useRef<HTMLInputElement>(null);
  const resolvedBoards = boards || [];
  const showCollectionUpload = true;

  const likedItems = useMemo(() => items.filter(i => likedIds?.has(i.id)), [items, likedIds]);
  const classificationCounts = useMemo(() => {
    return items.reduce<Record<ArtworkClassification, number>>(
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
    );
  }, [items]);
  const showFilterBar = items.length > 0;
  const normalizedCollectionSearch = collectionSearch.trim().toLowerCase();
  const artistInvalidationKey = useMemo(() => buildArtistInvalidationKey(items), [items]);
  const {
    artists,
    isLoading: artistsLoading,
    error: artistsError,
  } = useUserArtists({
    userId,
    invalidationKey: artistInvalidationKey,
    enabled: collectTab === 'artists',
  });

  const filteredItems = useMemo(() => {
    if (activeFilter === 'all') return items;
    return items.filter((item) => (item.classification || 'unsorted') === activeFilter);
  }, [items, activeFilter]);

  const searchedSavedItems = useMemo(() => {
    if (!normalizedCollectionSearch) return filteredItems;
    return filteredItems.filter((item) => {
      const haystacks = [
        item.artworkName,
        item.artistName,
        item.location?.museum_name,
        item.location?.institution_name,
        item.location?.city,
        item.movement,
        item.medium,
        ...(item.keywords || []),
      ].filter(Boolean) as string[];
      return haystacks.some((value) => value.toLowerCase().includes(normalizedCollectionSearch));
    });
  }, [filteredItems, normalizedCollectionSearch]);

  const groupedItems = useMemo(() => {
    const groups = new Map<string, GalleryItem[]>();
    [...searchedSavedItems].sort((a, b) => b.timestamp - a.timestamp).forEach(item => {
      const d = new Date(item.timestamp);
      const key = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    });
    return Array.from(groups.entries()).map(([label, groupItems]) => ({ label, items: groupItems }));
  }, [searchedSavedItems]);

  const boardDetailItems = useMemo(() => {
    if (!selectedBoard) return [];
    if (selectedBoard === 'liked') return likedItems;
    const album = resolvedBoards.find(a => a.id === selectedBoard);
    return album ? items.filter(i => album.itemIds.includes(i.id)) : [];
  }, [selectedBoard, likedItems, resolvedBoards, items]);

  const searchedBoardDetailItems = useMemo(() => {
    if (!normalizedCollectionSearch) return boardDetailItems;
    return boardDetailItems.filter((item) => {
      const haystacks = [
        item.artworkName,
        item.artistName,
        item.location?.museum_name,
        item.location?.institution_name,
        item.location?.city,
        item.movement,
        item.medium,
        ...(item.keywords || []),
      ].filter(Boolean) as string[];
      return haystacks.some((value) => value.toLowerCase().includes(normalizedCollectionSearch));
    });
  }, [boardDetailItems, normalizedCollectionSearch]);

  const boardDetailName = useMemo(() => {
    if (!selectedBoard) return '';
    if (selectedBoard === 'liked') return 'Liked';
    return resolvedBoards.find(a => a.id === selectedBoard)?.name ?? '';
  }, [selectedBoard, resolvedBoards]);
  const unsortedCount = useMemo(
    () => items.filter(item => (item.classification || 'unsorted') === 'unsorted').length,
    [items],
  );
  const savedContextLabel = useMemo(() => {
    if (activeFilter === 'all') return 'All Artworks';
    if (activeFilter === 'love') return 'Loved';
    if (activeFilter === 'respect') return 'Respect';
    if (activeFilter === 'not_for_me') return 'Not for Me';
    return 'Unsorted';
  }, [activeFilter]);

  const showSavedEmptyOverlay =
    searchedSavedItems.length === 0 && (Boolean(normalizedCollectionSearch) || activeFilter !== 'all');
  const showSavedLoadingSkeleton = !artworksLoaded && items.length === 0;

  const getCoverImages = (itemIds: string[]) =>
    itemIds.slice(0, 4).map(id => items.find(i => i.id === id)?.url).filter(Boolean) as string[];

  // Derive 4 cover images for an artist from loaded items
  const getArtistCovers = (artistId: string) =>
    items.filter(i => i.artistEntityId === artistId).slice(0, 4).map(i => i.url);

  const searchedBoards = useMemo(() => {
    if (!normalizedCollectionSearch) return resolvedBoards;
    return resolvedBoards.filter((board) => board.name.toLowerCase().includes(normalizedCollectionSearch));
  }, [resolvedBoards, normalizedCollectionSearch]);

  const searchedArtists = useMemo(() => {
    if (!normalizedCollectionSearch) return artists;
    return artists.filter((artist) =>
      [artist.display_name, artist.nationality]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(normalizedCollectionSearch)),
    );
  }, [artists, normalizedCollectionSearch]);

  const collectionSearchPlaceholder = useMemo(() => {
    if (collectTab === 'saved') {
      return selectedBoard ? `Search ${boardDetailName || 'board'}` : 'Search artworks';
    }
    if (collectTab === 'boards') {
      return selectedBoard ? `Search ${boardDetailName || 'board'}` : 'Search boards';
    }
    return 'Search artists';
  }, [boardDetailName, collectTab, selectedBoard]);

  useEffect(() => {
    if (collectTab !== 'saved' || savedLayout !== 'grid') {
      setSelectedArtworkIds([]);
    }
  }, [collectTab, savedLayout]);

  useEffect(() => {
    const searchableIds = new Set(
      searchedSavedItems
        .filter((item) => item.deleteStatus !== 'pending')
        .map((item) => item.id)
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

  const boardOverflowButtonClassName =
    'flex h-7 w-7 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-400 transition-colors hover:border-neutral-300 hover:text-neutral-700';

  const savedFilters: Array<{ id: ActiveFilter; label: string; count?: number; icon?: React.ReactNode }> = [
    { id: 'all', label: 'All', count: items.length },
    { id: 'love', label: 'Loved', count: classificationCounts.love },
    { id: 'respect', label: 'Respect', count: classificationCounts.respect },
    { id: 'not_for_me', label: 'Not for Me', count: classificationCounts.not_for_me },
    { id: 'unsorted', label: 'Unsorted', count: classificationCounts.unsorted },
  ];

  const TABS: { id: CollectTab; label: string }[] = [
    { id: 'saved',     label: 'All Artworks' },
    { id: 'boards',    label: 'Boards' },
    { id: 'artists',   label: 'Artists' },
  ];

  const submitBoard = async () => {
    const trimmedName = newBoardName.trim();
    const pendingRequest = createBoardRequest;
    if (!trimmedName || isSubmittingBoard || !pendingRequest) return;

    try {
      setIsSubmittingBoard(true);
      const createdBoard = await onCreateBoard(trimmedName, pendingRequest.itemIds);
      pendingRequest.onCreated?.(createdBoard);
      setNewBoardName('');
      setCreateBoardRequest(null);
    } catch (error) {
      console.error('Failed to create board:', error);
    } finally {
      setIsSubmittingBoard(false);
    }
  };

  const openCreateBoardModal = (options?: { itemIds?: string[]; onCreated?: (board: Board) => void }) => {
    setNewBoardName('');
    setCreateBoardRequest({
      itemIds: options?.itemIds,
      onCreated: options?.onCreated,
    });
  };

  const closeCreateBoardModal = () => {
    if (isSubmittingBoard) return;
    setCreateBoardRequest(null);
    setNewBoardName('');
  };

  const submitRenameBoard = async () => {
    const trimmedName = newBoardName.trim();
    if (!trimmedName || isSubmittingBoard || !renameBoardTarget) return;

    try {
      setIsSubmittingBoard(true);
      await onRenameBoard(renameBoardTarget.id, trimmedName);
      setRenameBoardTarget(null);
      setNewBoardName('');
    } catch (error) {
      console.error('Failed to rename board:', error);
    } finally {
      setIsSubmittingBoard(false);
    }
  };

  const openRenameBoardModal = (board: Board) => {
    setCreateBoardRequest(null);
    setRenameBoardTarget(board);
    setNewBoardName(board.name);
  };

  const closeRenameBoardModal = () => {
    if (isSubmittingBoard) return;
    setRenameBoardTarget(null);
    setNewBoardName('');
  };

  const handleDeleteBoard = async (board: Board) => {
    try {
      setIsSubmittingBoard(true);
      await onDeleteBoard(board.id);
      if (selectedBoard === board.id) {
        setSelectedBoard(null);
      }
      setDeleteBoardTarget(null);
    } catch (error) {
      console.error('Failed to delete board:', error);
    } finally {
      setIsSubmittingBoard(false);
    }
  };

  return (
    <div className="flex w-full min-h-full flex-col">
      <input
        ref={collectionUploadInputRef}
        type="file"
        accept={SUPPORTED_UPLOAD_ACCEPT}
        multiple
        className="hidden"
        onChange={(event) => onFileUpload(event, 'gallery')}
      />

      <div className="sticky top-0 z-[90] shrink-0 flex h-[52px] items-center justify-between gap-3 border-b border-neutral-100 bg-[var(--color-bg-primary)] px-4 md:hidden">
        <div className="flex min-w-0 items-center gap-3">
          {topBarLeftSlot ? <div className="shrink-0">{topBarLeftSlot}</div> : null}
          <span className="truncate text-[15px] font-semibold text-neutral-900">Collection</span>
        </div>
        {showCollectionUpload ? (
          <button
            onClick={() => collectionUploadInputRef.current?.click()}
            className="shrink-0 rounded-full border border-neutral-200 bg-white px-4 py-2 text-[12px] font-medium text-neutral-700 transition-colors hover:border-neutral-400 hover:bg-neutral-50"
          >
            Upload
          </button>
        ) : null}
      </div>

      <div className="flex flex-col md:mx-auto md:w-full md:max-w-[1000px] md:px-8 md:pt-8 lg:pt-10">

      {/* ── Top tab bar ── */}
      <div className="sticky top-[52px] z-[80] flex h-[52px] items-center gap-6 overflow-x-auto bg-[var(--color-bg-primary)] px-4 no-scrollbar sm:px-8 md:top-0 md:px-0">
        <div className="flex min-w-0 items-center gap-6 overflow-x-auto no-scrollbar">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => {
                onCollectTabChange(tab.id);
                setSelectedBoard(null);
              }}
              className={`shrink-0 h-full text-[13px] sm:text-[14px] font-medium border-b-2 transition-all -mb-px whitespace-nowrap ${
                collectTab === tab.id
                  ? 'border-neutral-900 text-neutral-900'
                  : 'border-transparent text-neutral-400 hover:text-neutral-700'
              }`}
            >{tab.label}</button>
          ))}
        </div>
        <div className="ml-auto hidden min-w-0 items-center gap-3 md:flex">
          <div className="flex w-[240px] items-center gap-2.5 rounded-full border border-neutral-200 bg-white px-3.5 py-2 text-neutral-700">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0 text-neutral-400">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              value={collectionSearch}
              onChange={(event) => setCollectionSearch(event.target.value)}
              placeholder={collectionSearchPlaceholder}
              className="w-full bg-transparent text-[12px] font-medium text-neutral-700 placeholder-neutral-400 outline-none"
            />
          </div>
          {showCollectionUpload && (
            <button
              onClick={() => collectionUploadInputRef.current?.click()}
              className="shrink-0 rounded-full border border-neutral-200 bg-white px-4 py-2 text-[12px] font-medium text-neutral-700 transition-colors hover:border-neutral-400 hover:bg-neutral-50"
            >
              Upload
            </button>
          )}
        </div>
      </div>

      <div className="px-4 pt-3 md:hidden">
        <div className="flex w-full items-center gap-2.5 rounded-full border border-neutral-200 bg-white px-3.5 py-2 text-neutral-700">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0 text-neutral-400">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={collectionSearch}
            onChange={(event) => setCollectionSearch(event.target.value)}
            placeholder={collectionSearchPlaceholder}
            className="w-full bg-transparent text-[16px] font-medium text-neutral-700 placeholder-neutral-400 outline-none"
          />
        </div>
      </div>

      {/* ── Content ── */}
      <div className="relative">

        {/* ── SAVED ── */}
        {collectTab === 'saved' && (
          <div className="flex flex-col">
            <div className="sticky top-[52px] z-[70] flex items-center justify-between gap-3 bg-[var(--color-bg-primary)] px-4 pt-3 pb-2 sm:px-8 md:px-0">
              <div className="flex min-w-0 items-center gap-2 overflow-x-auto no-scrollbar">
                {showFilterBar && (
                  <>
                    {savedFilters.filter((filter) => filter.id === 'all' || (filter.count ?? 0) > 0).map((filter) => (
                      <button
                        key={filter.id}
                        onClick={() => setActiveFilter(filter.id)}
                        className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition-all ${
                          activeFilter === filter.id
                            ? 'border-neutral-300 bg-neutral-100 text-neutral-900'
                            : 'border-neutral-200 text-neutral-500 hover:border-neutral-400'
                        }`}
                      >
                        {filter.label}
                        <span className={`rounded-full px-1.5 py-0.5 text-[8px] tracking-normal ${
                          activeFilter === filter.id
                            ? 'bg-white text-neutral-700'
                            : 'bg-neutral-100 text-neutral-500'
                        }`}>
                          {filter.count}
                        </span>
                      </button>
                    ))}
                  </>
                )}
                {unsortedCount > 0 && (
                  <button
                    onClick={onStartUnsortedFlow}
                    className="shrink-0 rounded-full border border-neutral-200 px-3 py-1 text-[11px] font-medium text-neutral-700 transition-colors hover:border-neutral-400"
                  >
                    Sort Unsorted Works
                  </button>
                )}
              </div>
              <div className="shrink-0 flex items-center gap-0.5 bg-neutral-100 rounded-full p-0.5">
                <button
                  onClick={() => setSavedLayout('grid')}
                  className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${savedLayout === 'grid' ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-400 hover:text-neutral-700'}`}
                  title="Grid"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                    <circle cx="4.5" cy="4.5" r="2.5"/><circle cx="12" cy="4.5" r="2.5"/><circle cx="19.5" cy="4.5" r="2.5"/>
                    <circle cx="4.5" cy="12" r="2.5"/><circle cx="12" cy="12" r="2.5"/><circle cx="19.5" cy="12" r="2.5"/>
                    <circle cx="4.5" cy="19.5" r="2.5"/><circle cx="12" cy="19.5" r="2.5"/><circle cx="19.5" cy="19.5" r="2.5"/>
                  </svg>
                </button>
                <button
                  onClick={() => setSavedLayout('grouped')}
                  className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${savedLayout === 'grouped' ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-400 hover:text-neutral-700'}`}
                  title="Grouped"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
                  </svg>
                </button>
              </div>
            </div>

            <div className="relative">
              {showSavedLoadingSkeleton ? (
                <div className="px-4 pt-4 pb-32 sm:px-8 md:px-0">
                  <CollectionGridSkeleton />
                </div>
              ) : savedLayout === 'grid' ? (
                <GridView
                  items={searchedSavedItems}
                  visit={visit}
                  filteredSessionId={filteredSessionId}
                  isAnalyzing={isAnalyzing}
                  boards={resolvedBoards}
                  selectedIds={selectedArtworkIds}
                  hasSelectionOverlay={selectedArtworkIds.length > 0}
                  onToggleSelection={toggleArtworkSelection}
                  onInterpret={(item, contextItems) => onInterpret(item, { items: contextItems || searchedSavedItems, label: savedContextLabel })}
                  onDelete={onDelete}
                />
              ) : (
                <div>
                  {groupedItems.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                      <p className="text-[12px] text-neutral-300">No artworks yet</p>
                    </div>
                  ) : (
                    <div className="px-4 pt-4 pb-32 space-y-8 sm:px-8 md:px-0">
                      {groupedItems.map(group => (
                        <div key={group.label}>
                          <p className="mb-3 text-[11px] font-medium text-neutral-400">{group.label}</p>
                          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-1.5 sm:gap-2">
                            {group.items.map(item => (
                              <div
                                key={item.id}
                                className={`group relative aspect-square overflow-hidden rounded bg-neutral-100 transition-opacity ${item.deleteStatus === 'pending' ? 'cursor-default opacity-45' : 'cursor-pointer hover:opacity-90'}`}
                                onClick={() => {
                                  if (item.deleteStatus === 'pending') return;
                                  onInterpret(item, { items: group.items, label: group.label });
                                }}
                              >
                                <img src={item.url} alt="" className={`w-full h-full object-cover ${item.deleteStatus === 'pending' ? 'saturate-[0.7]' : ''}`} />
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {artworksLoaded && showSavedEmptyOverlay && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <p className="text-[12px] text-neutral-300">
                    {normalizedCollectionSearch
                      ? 'No matching artworks'
                      : activeFilter === 'love'
                      ? 'No loved works yet'
                      : activeFilter === 'respect'
                        ? 'No respected works yet'
                        : activeFilter === 'not_for_me'
                          ? 'No works marked not for me'
                          : activeFilter === 'unsorted'
                            ? 'No unsorted works'
                            : 'No artworks yet'}
                  </p>
                </div>
              )}

              {savedLayout === 'grid' && selectedArtworkIds.length > 0 && (
                <div className="pointer-events-none sticky bottom-5 z-[69] flex min-h-[72px] items-end px-4 sm:px-8 md:px-0">
                  <div className="pointer-events-auto inline-flex w-fit max-w-full items-center gap-4 rounded-[78px] border border-neutral-200 bg-white px-6 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
                    <div className="whitespace-nowrap text-[13px] font-semibold text-neutral-900">
                      {selectedArtworkIds.length} selected
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="secondary"
                          className="min-w-[160px] justify-between gap-3"
                          disabled={isApplyingBoard}
                        >
                          <span>{isApplyingBoard ? 'Saving…' : 'Add to board'}</span>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="min-w-[180px]">
                        {resolvedBoards.map((board) => (
                          <DropdownMenuItem
                            key={board.id}
                            onSelect={(event) => {
                              event.preventDefault();
                              handleAddSelectionToBoard(board.id);
                            }}
                          >
                            {board.name}
                          </DropdownMenuItem>
                        ))}
                        {resolvedBoards.length > 0 && <div className="my-1 h-px bg-neutral-100" />}
                        <DropdownMenuItem
                          onSelect={(event) => {
                            event.preventDefault();
                            openCreateBoardModal({
                              itemIds: selectedArtworkIds,
                              onCreated: () => clearArtworkSelection(),
                            });
                          }}
                        >
                          <span className="mr-2 text-[14px] leading-none">+</span>
                          <span>New board</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Button
                      onClick={clearArtworkSelection}
                      variant="ghost"
                      className="px-0 font-medium"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── BOARDS ── */}
        {collectTab === 'boards' && (
          <div>
            {selectedBoard === null ? (
              <div className="px-4 pt-5 pb-32 sm:px-8 md:px-0">
                <div className="mb-5 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-medium text-neutral-400">Boards</p>
                    <p className="mt-1 text-[12px] text-neutral-500">Curate your own collections of artworks.</p>
                  </div>
                  <button
                    onClick={() =>
                      openCreateBoardModal({
                        onCreated: (createdBoard) => setSelectedBoard(createdBoard.id),
                      })
                    }
                    className="shrink-0 rounded-full border border-neutral-200 px-4 py-2 text-[12px] font-medium text-neutral-700 transition-colors hover:border-neutral-400"
                  >
                    New board
                  </button>
                </div>

                {boardsLoading ? (
                  <CollectionGridSkeleton />
                ) : likedItems.length === 0 && resolvedBoards.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 gap-2">
                    <p className="text-[12px] text-neutral-300">No boards yet</p>
                    <p className="text-[11px] text-neutral-400">Create a board to start curating your collection.</p>
                  </div>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 sm:gap-5">
                    {likedItems.length > 0 && (
                      <button onClick={() => setSelectedBoard('liked')} className="text-left group">
                        <BoardCoverMosaic covers={likedItems.slice(0, 3).map((item) => item.url)} />
                        <p className="text-[12px] font-semibold text-neutral-900 leading-tight truncate">Liked</p>
                        <p className="text-[11px] text-neutral-400 mt-0.5">{likedItems.length} {likedItems.length === 1 ? 'artwork' : 'artworks'}</p>
                      </button>
                    )}
                    {searchedBoards.map(album => {
                      const covers = getCoverImages(album.itemIds);
                      const count = album.itemIds.filter(id => items.find(i => i.id === id)).length;
                      return (
                        <div key={album.id} className="text-left group">
                          <button
                            type="button"
                            onClick={() => setSelectedBoard(album.id)}
                            className="block w-full"
                          >
                            <BoardCoverMosaic covers={covers.slice(0, 3)} />
                          </button>
                          <div className="flex items-start justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedBoard(album.id)}
                              className="min-w-0 flex-1 text-left"
                            >
                              <p className="text-[12px] font-semibold text-neutral-900 leading-tight truncate">{album.name}</p>
                              <p className="mt-0.5 text-[11px] text-neutral-400">{count} {count === 1 ? 'artwork' : 'artworks'}</p>
                            </button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  className={boardOverflowButtonClassName}
                                  aria-label={`${album.name} board actions`}
                                >
                                  <OverflowDotsIcon />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="min-w-[180px]">
                                <DropdownMenuItem
                                  onSelect={(event) => {
                                    event.preventDefault();
                                    openRenameBoardModal(album);
                                  }}
                                >
                                  Rename board
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  destructive
                                  onSelect={(event) => {
                                    event.preventDefault();
                                    setDeleteBoardTarget(album);
                                  }}
                                >
                                  Delete board
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col">
                <div className="shrink-0 flex items-center gap-3 px-4 pt-4 pb-3 border-b border-neutral-100 sm:px-8 md:px-0">
                  <button
                    onClick={() => setSelectedBoard(null)}
                    className="flex items-center gap-1.5 text-neutral-400 hover:text-neutral-900 transition-colors"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="15 18 9 12 15 6"/>
                    </svg>
                    <span className="text-[11px] font-medium">Boards</span>
                  </button>
                  <span className="text-neutral-200 text-xs">/</span>
                  <span className="text-[12px] font-semibold text-neutral-900">{boardDetailName}</span>
                  <span className="text-[10px] text-neutral-400 ml-auto">{boardDetailItems.length} {boardDetailItems.length === 1 ? 'artwork' : 'artworks'}</span>
                </div>
                <div className="flex-1 min-h-0">
                  {searchedBoardDetailItems.length === 0 ? (
                    <div className="flex items-center justify-center h-32">
                      <p className="text-[12px] text-neutral-300">
                        {normalizedCollectionSearch ? 'No matching artworks' : 'Empty board'}
                      </p>
                    </div>
                  ) : (
                    <div className="px-4 pt-4 pb-32 grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 sm:px-8 md:grid-cols-5 md:px-0">
                      {searchedBoardDetailItems.map(item => (
                        <div
                          key={item.id}
                          className={`aspect-square overflow-hidden rounded bg-neutral-100 transition-opacity ${item.deleteStatus === 'pending' ? 'cursor-default opacity-45' : 'cursor-pointer hover:opacity-90'}`}
                          onClick={() => {
                            if (item.deleteStatus === 'pending') return;
                            onInterpret(item, { items: searchedBoardDetailItems, label: boardDetailName });
                          }}
                        >
                          <img src={item.url} alt="" className={`w-full h-full object-cover ${item.deleteStatus === 'pending' ? 'saturate-[0.7]' : ''}`} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── ARTISTS ── */}
        {collectTab === 'artists' && (
          <div>
            <div className="px-4 pt-5 pb-32 sm:px-8 md:px-0">
              {artistsLoading ? (
                <CollectionGridSkeleton />
              ) : artistsError && searchedArtists.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 gap-2">
                  <p className="text-[12px] text-neutral-300">Couldn&apos;t load artists</p>
                  <p className="text-[11px] text-neutral-400">Try again in a moment.</p>
                </div>
              ) : searchedArtists.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 gap-2">
                  <p className="text-[12px] text-neutral-300">
                    {normalizedCollectionSearch ? 'No matching artists' : 'No artists yet'}
                  </p>
                  {!normalizedCollectionSearch && (
                    <p className="text-[11px] text-neutral-400">Explore artworks to discover artists</p>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
                  {searchedArtists.map(artist => {
                    const artistWorks = items
                      .filter((item) => item.artistEntityId === artist.id && !item.isDeletedPlaceholder)
                      .slice(0, 3);
                    return (
                      <button
                        key={artist.id}
                        onClick={() => onOpenArtist(artist.id, artist.display_name)}
                        className="group flex h-full flex-col rounded-[24px] border border-neutral-200 bg-white p-3 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all hover:border-neutral-300 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)]"
                      >
                        <div className={`grid ${ARTIST_CARD_MEDIA_HEIGHT} min-h-0 grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] gap-2.5`}>
                          <div className="h-full min-h-0 overflow-hidden rounded-[20px] bg-[var(--color-bg-tertiary)]">
                            {artist.profile_image_url ? (
                              <img
                                src={artist.profile_image_url}
                                alt={artist.display_name}
                                className="block h-full w-full object-cover object-center"
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center bg-[var(--color-bg-tertiary)]">
                                <span className="text-4xl font-semibold text-neutral-300">
                                  {artist.display_name[0]?.toUpperCase()}
                                </span>
                              </div>
                            )}
                          </div>
                          <ArtistArtworkCluster works={artistWorks} />
                        </div>
                        <div className="mt-3 flex items-end justify-between gap-3 px-1">
                          <p className="min-w-0 truncate text-[13px] font-semibold leading-tight text-neutral-900">
                            {artist.display_name}
                          </p>
                          <span className="shrink-0 text-[11px] text-neutral-400">
                            {artist.artwork_count} {artist.artwork_count === 1 ? 'work' : 'works'}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        <CreateBoardModal
          open={createBoardRequest !== null}
          value={newBoardName}
          title="New board"
          heading="Name your board"
          description="Create a board to group artworks into a collection you can return to later."
          submitLabel="Create board"
          isSubmitting={isSubmittingBoard}
          onValueChange={setNewBoardName}
          onClose={closeCreateBoardModal}
          onSubmit={submitBoard}
        />

        <CreateBoardModal
          open={renameBoardTarget !== null}
          value={newBoardName}
          title="Rename board"
          heading="Update board name"
          description="Give this board a clearer name without changing the artworks inside it."
          submitLabel="Save name"
          isSubmitting={isSubmittingBoard}
          onValueChange={setNewBoardName}
          onClose={closeRenameBoardModal}
          onSubmit={submitRenameBoard}
        />

        <ConfirmBoardDeleteModal
          board={deleteBoardTarget}
          isDeleting={isSubmittingBoard}
          onClose={() => {
            if (!isSubmittingBoard) setDeleteBoardTarget(null);
          }}
          onConfirm={(board) => {
            void handleDeleteBoard(board);
          }}
        />

      </div>
      </div>
    </div>
  );
};

export default OrganizeView;
