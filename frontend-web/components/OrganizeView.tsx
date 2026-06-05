
import React, { useState, useMemo, useEffect } from 'react';
import { GalleryItem, Visit, Album, ArtistEntity } from '../types';
import { fetchUserArtists, type SmartCollection } from '../api/artworks';
import GridView from './GridView';
import SmartCollectionsView from './SmartCollectionsView';
import CreateBoardModal from './CreateBoardModal';
import ConfirmBoardDeleteModal from './ConfirmBoardDeleteModal';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';

const OverflowDotsIcon: React.FC<{ className?: string }> = ({ className = 'h-3.5 w-3.5' }) => (
  <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden="true">
    <circle cx="3" cy="8" r="1.25" />
    <circle cx="8" cy="8" r="1.25" />
    <circle cx="13" cy="8" r="1.25" />
  </svg>
);

export type CollectTab = 'saved' | 'boards' | 'movements' | 'artists';
type SavedLayout = 'grid' | 'grouped';
type ActiveFilter = 'all' | 'liked' | string;

interface ArtistRow extends ArtistEntity {
  artwork_count: number;
}

interface Props {
  items: GalleryItem[];
  visit: Visit;
  filteredVisitId: string | null;
  isAnalyzing: boolean;
  likedIds?: Set<string>;
  albums?: Album[];
  boardsLoading?: boolean;
  userId?: string | null;
  collectTab: CollectTab;
  onCollectTabChange: (tab: CollectTab) => void;
  onCreateBoard: (name: string, itemIds?: string[]) => Promise<Album>;
  onRenameBoard: (boardId: string, name: string) => Promise<Album>;
  onDeleteBoard: (boardId: string) => Promise<void>;
  onAddItemsToBoard: (boardId: string, itemIds: string[]) => Promise<void>;
  onOpenArtist: (artistEntityId: string, artistName: string) => void;
  onOpenMovement: (collection: SmartCollection) => void;
  onInterpret: (item: GalleryItem, context?: { items: GalleryItem[]; label: string }) => void;
  onDelete: (id: string) => void;
  onStartUnsortedFlow: () => void;
}

const OrganizeView: React.FC<Props> = ({
  items, visit, filteredVisitId, isAnalyzing,
  likedIds, albums, boardsLoading, userId,
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
  const [selectedBoard, setSelectedBoard] = useState<'liked' | string | null>(null);
  const [newBoardName, setNewBoardName] = useState('');
  const [isSubmittingBoard, setIsSubmittingBoard] = useState(false);
  const [createBoardRequest, setCreateBoardRequest] = useState<{
    itemIds?: string[];
    onCreated?: (board: Album) => void;
  } | null>(null);
  const [renameBoardTarget, setRenameBoardTarget] = useState<Album | null>(null);
  const [deleteBoardTarget, setDeleteBoardTarget] = useState<Album | null>(null);
  const [artists, setArtists] = useState<ArtistRow[]>([]);
  const [artistsLoading, setArtistsLoading] = useState(false);
  const boards = albums || [];

  // Fetch artists when the tab is first activated
  useEffect(() => {
    if (collectTab !== 'artists' || !userId || artists.length > 0) return;
    let cancelled = false;
    setArtistsLoading(true);
    fetchUserArtists(userId)
      .then(data => { if (!cancelled) setArtists(data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setArtistsLoading(false); });
    return () => { cancelled = true; };
  }, [collectTab, userId]);

  const likedItems = useMemo(() => items.filter(i => likedIds?.has(i.id)), [items, likedIds]);
  const activeAlbums = useMemo(() =>
    boards.filter(a => a.itemIds.some(id => items.find(i => i.id === id))),
    [boards, items]
  );
  const showFilterBar = likedItems.length > 0 || activeAlbums.length > 0;

  const filteredItems = useMemo(() => {
    if (activeFilter === 'all') return items;
    if (activeFilter === 'liked') return likedItems;
    const album = boards.find(a => a.id === activeFilter);
    return album ? items.filter(i => album.itemIds.includes(i.id)) : items;
  }, [items, activeFilter, likedItems, boards]);

  const groupedItems = useMemo(() => {
    const groups = new Map<string, GalleryItem[]>();
    [...filteredItems].sort((a, b) => b.timestamp - a.timestamp).forEach(item => {
      const d = new Date(item.timestamp);
      const key = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    });
    return Array.from(groups.entries()).map(([label, groupItems]) => ({ label, items: groupItems }));
  }, [filteredItems]);

  const boardDetailItems = useMemo(() => {
    if (!selectedBoard) return [];
    if (selectedBoard === 'liked') return likedItems;
    const album = boards.find(a => a.id === selectedBoard);
    return album ? items.filter(i => album.itemIds.includes(i.id)) : [];
  }, [selectedBoard, likedItems, boards, items]);

  const boardDetailName = useMemo(() => {
    if (!selectedBoard) return '';
    if (selectedBoard === 'liked') return 'Liked';
    return boards.find(a => a.id === selectedBoard)?.name ?? '';
  }, [selectedBoard, boards]);
  const unsortedCount = useMemo(
    () => items.filter(item => (item.classification || 'unsorted') === 'unsorted').length,
    [items],
  );
  const savedContextLabel = useMemo(() => {
    if (activeFilter === 'liked') return 'Liked';
    if (activeFilter === 'all') return 'All Artworks';
    return boards.find(a => a.id === activeFilter)?.name || 'All Artworks';
  }, [activeFilter, boards]);

  const getCoverImages = (itemIds: string[]) =>
    itemIds.slice(0, 4).map(id => items.find(i => i.id === id)?.url).filter(Boolean) as string[];

  // Derive 4 cover images for an artist from loaded items
  const getArtistCovers = (artistId: string) =>
    items.filter(i => i.artistEntityId === artistId).slice(0, 4).map(i => i.url);

  const boardOverflowButtonClassName =
    'flex h-7 w-7 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-400 transition-colors hover:border-neutral-300 hover:text-neutral-700';

  const TABS: { id: CollectTab; label: string }[] = [
    { id: 'saved',     label: 'All Artworks' },
    { id: 'boards',    label: 'Boards' },
    { id: 'movements', label: 'Smart Collections' },
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

  const openCreateBoardModal = (options?: { itemIds?: string[]; onCreated?: (board: Album) => void }) => {
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

  const openRenameBoardModal = (board: Album) => {
    setCreateBoardRequest(null);
    setRenameBoardTarget(board);
    setNewBoardName(board.name);
  };

  const closeRenameBoardModal = () => {
    if (isSubmittingBoard) return;
    setRenameBoardTarget(null);
    setNewBoardName('');
  };

  const handleDeleteBoard = async (board: Album) => {
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
    <div className="flex flex-col w-full h-full overflow-hidden">

      {/* ── Top tab bar ── */}
      <div className="shrink-0 flex items-end gap-7 px-5 sm:px-8 border-b border-neutral-100 overflow-x-auto no-scrollbar">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => {
              onCollectTabChange(tab.id);
              setSelectedBoard(null);
            }}
            className={`shrink-0 pt-3 pb-3 text-[11px] sm:text-[12px] tracking-[0.14em] uppercase font-semibold border-b-2 transition-all -mb-px whitespace-nowrap ${
              collectTab === tab.id
                ? 'border-neutral-900 text-neutral-900'
                : 'border-transparent text-neutral-400 hover:text-neutral-700'
            }`}
          >{tab.label}</button>
        ))}
      </div>

      {/* ── Content ── */}
      <div className="flex-1 min-h-0 overflow-hidden relative">

        {/* ── SAVED ── */}
        {collectTab === 'saved' && (
          <div className="flex flex-col h-full">
            <div className="shrink-0 flex items-center justify-between gap-3 px-5 sm:px-8 pt-3 pb-2">
              <div className="flex min-w-0 items-center gap-2 overflow-x-auto no-scrollbar">
                {showFilterBar && (
                  <>
                    <button
                      onClick={() => setActiveFilter('all')}
                      className={`shrink-0 text-[9px] tracking-[0.2em] uppercase px-3 py-1 rounded-full border transition-all ${
                        activeFilter === 'all' ? 'bg-neutral-900 text-white border-neutral-900' : 'border-neutral-200 text-neutral-500 hover:border-neutral-400'
                      }`}
                    >All</button>
                    {likedItems.length > 0 && (
                      <button
                        onClick={() => setActiveFilter('liked')}
                        className={`shrink-0 flex items-center gap-1.5 text-[9px] tracking-[0.2em] uppercase px-3 py-1 rounded-full border transition-all ${
                          activeFilter === 'liked' ? 'bg-neutral-900 text-white border-neutral-900' : 'border-neutral-200 text-neutral-500 hover:border-neutral-400'
                        }`}
                      >
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                        </svg>
                        Liked
                      </button>
                    )}
                    {activeAlbums.map(album => (
                      <button
                        key={album.id}
                        onClick={() => setActiveFilter(album.id)}
                        className={`shrink-0 text-[9px] tracking-[0.2em] uppercase px-3 py-1 rounded-full border transition-all ${
                          activeFilter === album.id ? 'bg-neutral-900 text-white border-neutral-900' : 'border-neutral-200 text-neutral-500 hover:border-neutral-400'
                        }`}
                      >{album.name}</button>
                    ))}
                  </>
                )}
                {unsortedCount > 0 && (
                  <button
                    onClick={onStartUnsortedFlow}
                    className="shrink-0 rounded-full border border-neutral-200 px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-neutral-700 transition-colors hover:border-neutral-400"
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

            <div className="flex-1 min-h-0 relative">
              {savedLayout === 'grid' ? (
                <GridView
                  items={filteredItems}
                  visit={visit}
                  filteredVisitId={filteredVisitId}
                  isAnalyzing={isAnalyzing}
                  boards={boards}
                  onInterpret={(item, contextItems) => onInterpret(item, { items: contextItems || filteredItems, label: savedContextLabel })}
                  onDelete={onDelete}
                  onRequestCreateBoard={openCreateBoardModal}
                  onAddToBoard={onAddItemsToBoard}
                />
              ) : (
                <div className="h-full overflow-y-auto">
                  {groupedItems.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                      <p className="text-[10px] tracking-[0.3em] uppercase text-neutral-300">No pieces yet</p>
                    </div>
                  ) : (
                    <div className="px-5 sm:px-8 pt-4 pb-32 space-y-8">
                      {groupedItems.map(group => (
                        <div key={group.label}>
                          <p className="text-[10px] tracking-[0.25em] uppercase text-neutral-400 font-medium mb-3">{group.label}</p>
                          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-1.5 sm:gap-2">
                            {group.items.map(item => (
                              <div
                                key={item.id}
                                className="group relative aspect-square cursor-pointer overflow-hidden rounded bg-neutral-100 hover:opacity-90 transition-opacity"
                                onClick={() => onInterpret(item, { items: group.items, label: group.label })}
                              >
                                <img src={item.url} alt="" className="w-full h-full object-cover" />
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {filteredItems.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <p className="text-[10px] tracking-[0.3em] uppercase text-neutral-300">
                    {activeFilter === 'liked' ? 'No liked pieces yet' : activeFilter !== 'all' ? 'No pieces in this album' : 'No pieces yet'}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── BOARDS ── */}
        {collectTab === 'boards' && (
          <div className="h-full overflow-y-auto">
            {selectedBoard === null ? (
              <div className="px-5 sm:px-8 pt-5 pb-32">
                <div className="mb-5 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] tracking-[0.25em] uppercase text-neutral-400 font-medium">Boards</p>
                    <p className="mt-1 text-[12px] text-neutral-500">Curate your own collections of artworks.</p>
                  </div>
                  <button
                    onClick={() =>
                      openCreateBoardModal({
                        onCreated: (createdBoard) => setSelectedBoard(createdBoard.id),
                      })
                    }
                    className="shrink-0 rounded-full border border-neutral-200 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-700 transition-colors hover:border-neutral-400"
                  >
                    New board
                  </button>
                </div>

                {boardsLoading ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 sm:gap-5">
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} className="text-left">
                        <div className="rounded-xl aspect-square bg-neutral-100 animate-pulse mb-2.5" />
                        <div className="h-3 bg-neutral-100 rounded animate-pulse w-3/4 mb-1" />
                        <div className="h-2.5 bg-neutral-100 rounded animate-pulse w-1/2" />
                      </div>
                    ))}
                  </div>
                ) : likedItems.length === 0 && boards.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 gap-2">
                    <p className="text-[10px] tracking-[0.3em] uppercase text-neutral-300">No boards yet</p>
                    <p className="text-[11px] text-neutral-400">Create a board to start curating your collection.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 sm:gap-5">
                    {likedItems.length > 0 && (
                      <button onClick={() => setSelectedBoard('liked')} className="text-left group">
                        <div className="grid grid-cols-2 gap-0.5 bg-neutral-100 overflow-hidden rounded-xl aspect-square mb-2.5">
                          {likedItems.slice(0, 4).map((item, i) => (
                            <img key={i} src={item.url} alt="" className="w-full h-full object-cover aspect-square" />
                          ))}
                          {Array(Math.max(0, 4 - Math.min(likedItems.length, 4))).fill(null).map((_, i) => (
                            <div key={`e${i}`} className="bg-neutral-100 aspect-square" />
                          ))}
                        </div>
                        <p className="text-[12px] font-semibold text-neutral-900 leading-tight truncate">Liked</p>
                        <p className="text-[11px] text-neutral-400 mt-0.5">{likedItems.length} {likedItems.length === 1 ? 'piece' : 'pieces'}</p>
                      </button>
                    )}
                    {boards.map(album => {
                      const covers = getCoverImages(album.itemIds);
                      const count = album.itemIds.filter(id => items.find(i => i.id === id)).length;
                      return (
                        <div key={album.id} className="text-left group">
                          <button
                            type="button"
                            onClick={() => setSelectedBoard(album.id)}
                            className="block w-full"
                          >
                            <div className="grid grid-cols-2 gap-0.5 bg-neutral-100 overflow-hidden rounded-xl aspect-square mb-2.5">
                              {covers.slice(0, 4).map((url, i) => (
                                <img key={i} src={url} alt="" className="w-full h-full object-cover aspect-square" />
                              ))}
                              {Array(Math.max(0, 4 - covers.length)).fill(null).map((_, i) => (
                                <div key={`e${i}`} className="bg-neutral-50 aspect-square" />
                              ))}
                            </div>
                          </button>
                          <div className="flex items-start justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedBoard(album.id)}
                              className="min-w-0 flex-1 text-left"
                            >
                              <p className="text-[12px] font-semibold text-neutral-900 leading-tight truncate">{album.name}</p>
                              <p className="mt-0.5 text-[11px] text-neutral-400">{count} {count === 1 ? 'piece' : 'pieces'}</p>
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
              <div className="flex flex-col h-full">
                <div className="shrink-0 flex items-center gap-3 px-5 sm:px-8 pt-4 pb-3 border-b border-neutral-100">
                  <button
                    onClick={() => setSelectedBoard(null)}
                    className="flex items-center gap-1.5 text-neutral-400 hover:text-neutral-900 transition-colors"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="15 18 9 12 15 6"/>
                    </svg>
                    <span className="text-[10px] tracking-[0.15em] uppercase">Boards</span>
                  </button>
                  <span className="text-neutral-200 text-xs">/</span>
                  <span className="text-[12px] font-semibold text-neutral-900">{boardDetailName}</span>
                  <span className="text-[10px] text-neutral-400 ml-auto">{boardDetailItems.length} {boardDetailItems.length === 1 ? 'piece' : 'pieces'}</span>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto">
                  {boardDetailItems.length === 0 ? (
                    <div className="flex items-center justify-center h-32">
                      <p className="text-[10px] tracking-[0.3em] uppercase text-neutral-300">Empty board</p>
                    </div>
                  ) : (
                    <div className="px-5 sm:px-8 pt-4 pb-32 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 sm:gap-3">
                      {boardDetailItems.map(item => (
                        <div
                          key={item.id}
                          className="aspect-square cursor-pointer overflow-hidden rounded bg-neutral-100 hover:opacity-90 transition-opacity"
                          onClick={() => onInterpret(item, { items: boardDetailItems, label: boardDetailName })}
                        >
                          <img src={item.url} alt="" className="w-full h-full object-cover" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── ART MOVEMENTS ── */}
        {collectTab === 'movements' && (
          <SmartCollectionsView
            userId={userId ?? null}
            onSelect={onOpenMovement}
          />
        )}

        {/* ── ARTISTS ── */}
        {collectTab === 'artists' && (
          <div className="h-full overflow-y-auto">
            <div className="px-5 sm:px-8 pt-5 pb-32">
              {artistsLoading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 sm:gap-5">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="text-left">
                      <div className="rounded-xl aspect-square bg-neutral-100 animate-pulse mb-2.5" />
                      <div className="h-3 bg-neutral-100 rounded animate-pulse w-3/4 mb-1" />
                      <div className="h-2.5 bg-neutral-100 rounded animate-pulse w-1/2" />
                    </div>
                  ))}
                </div>
              ) : artists.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 gap-2">
                  <p className="text-[10px] tracking-[0.3em] uppercase text-neutral-300">No artists yet</p>
                  <p className="text-[11px] text-neutral-400">Explore artworks to discover artists</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 sm:gap-5">
                  {artists.map(artist => {
                    const covers = getArtistCovers(artist.id);
                    const lifespan = artist.birth_year && artist.death_year
                      ? `${artist.birth_year}–${artist.death_year}`
                      : artist.birth_year ? `b. ${artist.birth_year}` : null;
                    const subtitle = [artist.nationality, lifespan].filter(Boolean).join(' · ');
                    return (
                      <button
                        key={artist.id}
                        onClick={() => onOpenArtist(artist.id, artist.display_name)}
                        className="text-left group"
                      >
                        {/* 2×2 cover grid */}
                        <div className="grid grid-cols-2 gap-0.5 bg-neutral-100 overflow-hidden rounded-xl aspect-square mb-2.5">
                          {covers.slice(0, 4).map((url, i) => (
                            <img key={i} src={url} alt="" className="w-full h-full object-cover aspect-square" />
                          ))}
                          {covers.length === 0 && (
                            <div className="col-span-2 row-span-2 flex items-center justify-center bg-neutral-100">
                              <span className="text-3xl font-bold text-neutral-300">
                                {artist.display_name[0]?.toUpperCase()}
                              </span>
                            </div>
                          )}
                          {covers.length > 0 && Array(Math.max(0, 4 - covers.length)).fill(null).map((_, i) => (
                            <div key={`e${i}`} className="bg-neutral-100 aspect-square" />
                          ))}
                        </div>
                        <p className="text-[12px] font-semibold text-neutral-900 leading-tight mb-0.5 truncate">{artist.display_name}</p>
                        <p className="text-[11px] text-neutral-400 truncate">
                          {subtitle || `${artist.artwork_count} ${artist.artwork_count === 1 ? 'work' : 'works'}`}
                        </p>
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
  );
};

export default OrganizeView;
