
import React, { useState, useMemo } from 'react';
import { GalleryItem, Visit, Album } from '../types';
import GridView from './GridView';
import SmartCollectionsView from './SmartCollectionsView';

type MainTab = 'saved' | 'boards' | 'smart';
type SavedLayout = 'grid' | 'grouped';
type ActiveFilter = 'all' | 'liked' | string;

interface Props {
  items: GalleryItem[];
  visit: Visit;
  filteredVisitId: string | null;
  isAnalyzing: boolean;
  likedIds?: Set<string>;
  albums?: Album[];
  userId?: string | null;
  onInterpret: (item: GalleryItem) => void;
  onDelete: (id: string) => void;
}

const OrganizeView: React.FC<Props> = ({
  items, visit, filteredVisitId, isAnalyzing,
  likedIds, albums, userId, onInterpret, onDelete,
}) => {
  const [mainTab, setMainTab] = useState<MainTab>('saved');
  const [savedLayout, setSavedLayout] = useState<SavedLayout>('grid');
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('all');
  const [selectedBoard, setSelectedBoard] = useState<'liked' | string | null>(null);

  const likedItems = useMemo(() => items.filter(i => likedIds?.has(i.id)), [items, likedIds]);
  const activeAlbums = useMemo(() =>
    (albums || []).filter(a => a.itemIds.some(id => items.find(i => i.id === id))),
    [albums, items]
  );
  const showFilterBar = likedItems.length > 0 || activeAlbums.length > 0;

  const filteredItems = useMemo(() => {
    if (activeFilter === 'all') return items;
    if (activeFilter === 'liked') return likedItems;
    const album = (albums || []).find(a => a.id === activeFilter);
    return album ? items.filter(i => album.itemIds.includes(i.id)) : items;
  }, [items, activeFilter, likedItems, albums]);

  // Grouped by month/year for the grouped sub-layout
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

  // Board detail items
  const boardDetailItems = useMemo(() => {
    if (!selectedBoard) return [];
    if (selectedBoard === 'liked') return likedItems;
    const album = (albums || []).find(a => a.id === selectedBoard);
    return album ? items.filter(i => album.itemIds.includes(i.id)) : [];
  }, [selectedBoard, likedItems, albums, items]);

  const boardDetailName = useMemo(() => {
    if (!selectedBoard) return '';
    if (selectedBoard === 'liked') return 'Liked';
    return (albums || []).find(a => a.id === selectedBoard)?.name ?? '';
  }, [selectedBoard, albums]);

  // Cover images for a board
  const getCoverImages = (itemIds: string[]) =>
    itemIds.slice(0, 4).map(id => items.find(i => i.id === id)?.url).filter(Boolean) as string[];

  const TABS: { id: MainTab; label: string }[] = [
    { id: 'saved', label: 'Saved' },
    { id: 'boards', label: 'Boards' },
    { id: 'smart', label: 'Collections' },
  ];

  return (
    <div className="flex flex-col w-full h-full overflow-hidden">

      {/* ── Top tab bar ── */}
      <div className="shrink-0 flex items-end gap-7 px-5 sm:px-8 border-b border-neutral-100">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => { setMainTab(tab.id); setSelectedBoard(null); }}
            className={`pt-3 pb-3 text-[11px] sm:text-[12px] tracking-[0.14em] uppercase font-semibold border-b-2 transition-all -mb-px whitespace-nowrap ${
              mainTab === tab.id
                ? 'border-neutral-900 text-neutral-900'
                : 'border-transparent text-neutral-400 hover:text-neutral-700'
            }`}
          >{tab.label}</button>
        ))}
      </div>

      {/* ── Content ── */}
      <div className="flex-1 min-h-0 overflow-hidden relative">

        {/* ── SAVED ── */}
        {mainTab === 'saved' && (
          <div className="flex flex-col h-full">
            {/* Saved controls row: filter chips + layout toggle */}
            <div className="shrink-0 flex items-center justify-between gap-3 px-5 sm:px-8 pt-3 pb-2">
              {/* Filter chips */}
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
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
              </div>
              {/* Layout toggle */}
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

            {/* Saved content */}
            <div className="flex-1 min-h-0 relative">
              {savedLayout === 'grid' ? (
                <GridView
                  items={filteredItems}
                  visit={visit}
                  filteredVisitId={filteredVisitId}
                  isAnalyzing={isAnalyzing}
                  onInterpret={onInterpret}
                  onDelete={onDelete}
                />
              ) : (
                /* Grouped view */
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
                                className="aspect-square cursor-pointer overflow-hidden bg-neutral-100 hover:opacity-90 transition-opacity"
                                onClick={() => onInterpret(item)}
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
        {mainTab === 'boards' && (
          <div className="h-full overflow-y-auto">
            {selectedBoard === null ? (
              /* Board grid */
              <div className="px-5 sm:px-8 pt-5 pb-32">
                {likedItems.length === 0 && activeAlbums.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 gap-2">
                    <p className="text-[10px] tracking-[0.3em] uppercase text-neutral-300">No boards yet</p>
                    <p className="text-[11px] text-neutral-400">Like artworks or create albums to get started</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 sm:gap-5">
                    {/* Liked pseudo-board */}
                    {likedItems.length > 0 && (
                      <button
                        onClick={() => setSelectedBoard('liked')}
                        className="text-left group"
                      >
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
                    {/* Named albums */}
                    {activeAlbums.map(album => {
                      const covers = getCoverImages(album.itemIds);
                      const count = album.itemIds.filter(id => items.find(i => i.id === id)).length;
                      return (
                        <button
                          key={album.id}
                          onClick={() => setSelectedBoard(album.id)}
                          className="text-left group"
                        >
                          <div className="grid grid-cols-2 gap-0.5 bg-neutral-100 overflow-hidden rounded-xl aspect-square mb-2.5">
                            {covers.slice(0, 4).map((url, i) => (
                              <img key={i} src={url} alt="" className="w-full h-full object-cover aspect-square" />
                            ))}
                            {Array(Math.max(0, 4 - covers.length)).fill(null).map((_, i) => (
                              <div key={`e${i}`} className="bg-neutral-50 aspect-square" />
                            ))}
                          </div>
                          <p className="text-[12px] font-semibold text-neutral-900 leading-tight truncate">{album.name}</p>
                          <p className="text-[11px] text-neutral-400 mt-0.5">{count} {count === 1 ? 'piece' : 'pieces'}</p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              /* Board detail */
              <div className="flex flex-col h-full">
                {/* Back + title */}
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
                {/* Album grid */}
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
                          onClick={() => onInterpret(item)}
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


        {/* ── SMART COLLECTIONS ── */}
        {mainTab === 'smart' && (
          <SmartCollectionsView
            items={items}
            userId={userId ?? null}
            onInterpret={onInterpret}
          />
        )}

      </div>
    </div>
  );
};

export default OrganizeView;
