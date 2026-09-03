import React from 'react';
import { createPortal } from 'react-dom';
import type { GalleryItem } from '../types';
import { ARTWORK_CTA_ADD_FROM_COLLECTION } from '../lib/artworkSourceCtas';

type CollectionView = 'grid' | 'list';

type AddFromLibraryModalProps = {
  open: boolean;
  items: GalleryItem[];
  // Seeds the modal's own selection when it opens; the tray is only touched
  // on confirm, so selecting inside the modal is non-destructive.
  initialSelectedIds: string[];
  searchValue: string;
  maxSelection?: number;
  currentSessionId?: string | null;
  onRefresh?: () => void;
  onClose: () => void;
  onSearchChange: (value: string) => void;
  onConfirm: (selectedItems: GalleryItem[]) => void;
};

type ArtworkAvailability = 'available' | 'already-added' | 'analyzing';

function formatSecondaryMeta(item: GalleryItem): string {
  if (item.artistName) return item.artistName;
  if (item.photoTime) return item.photoTime;
  return 'Saved artwork';
}

function getArtworkAvailability(
  item: GalleryItem,
  currentSessionId?: string | null,
): ArtworkAvailability {
  if (
    currentSessionId
    && item.sessionLinks?.some((link) => link.sessionId === currentSessionId)
  ) {
    return 'already-added';
  }
  if (item.isAnalyzing) return 'analyzing';
  return 'available';
}

export default function AddFromLibraryModal({
  open,
  items,
  initialSelectedIds,
  searchValue,
  maxSelection = 5,
  currentSessionId,
  onRefresh,
  onClose,
  onSearchChange,
  onConfirm,
}: AddFromLibraryModalProps) {
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [view, setView] = React.useState<CollectionView>('grid');

  // Seed the internal selection each time the modal opens.
  React.useEffect(() => {
    if (!open) return;
    onRefresh?.();
    setSelectedIds(
      items
        .filter((item) => (
          initialSelectedIds.includes(item.id)
          && getArtworkAvailability(item, currentSessionId) === 'available'
        ))
        .map((item) => item.id),
    );
    // Only re-seed on open; live `items`/`initialSelectedIds` churn shouldn't
    // reset an in-progress selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggleSelect = (item: GalleryItem) => {
    setSelectedIds((prev) => (
      prev.includes(item.id)
        ? prev.filter((id) => id !== item.id)
        : [...prev, item.id]
    ));
  };

  React.useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  const filteredItems = React.useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    const sorted = [...items].sort((a, b) => (b.sessionCapturedAt ?? b.timestamp) - (a.sessionCapturedAt ?? a.timestamp));

    if (!query) return sorted;

    return sorted.filter((item) => {
      const haystack = [
        item.artworkName,
        item.artistName,
        item.keywords.join(' '),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [items, searchValue]);

  if (!open) return null;

  const currentItemsById = new Map(items.map((item) => [item.id, item] as const));
  const currentSelectedItems = selectedIds
    .map((id) => currentItemsById.get(id))
    .filter((item): item is GalleryItem => (
      Boolean(item)
      && getArtworkAvailability(item!, currentSessionId) === 'available'
    ));
  const currentSelectedIds = new Set(currentSelectedItems.map((item) => item.id));
  const selectedCount = currentSelectedItems.length;

  return createPortal(
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/20 p-4 backdrop-blur-[2px] sm:p-6">
      <button
        type="button"
        aria-label="Close add from library modal"
        className="absolute inset-0"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        className="relative z-10 flex h-[min(700px,84vh)] w-full max-w-[920px] flex-col overflow-hidden rounded-[24px] border border-neutral-200 bg-white shadow-[0_24px_64px_rgba(0,0,0,0.12)]"
      >
        <div className="flex items-center justify-between px-6 pb-4 pt-6">
          <h2 className="text-[18px] font-semibold tracking-tight text-neutral-900">{ARTWORK_CTA_ADD_FROM_COLLECTION}</h2>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-700 transition-colors hover:bg-neutral-100"
            aria-label="Close modal"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex items-center gap-4 border-b border-neutral-100 px-6 pb-4">
          <input
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search your collection"
            className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[16px] text-neutral-900 placeholder:text-neutral-400 outline-none"
          />
          <div className="flex shrink-0 rounded-full bg-neutral-100 p-1" aria-label="Collection layout">
            <button
              type="button"
              aria-label="Show artwork tiles"
              aria-pressed={view === 'grid'}
              onClick={() => setView('grid')}
              className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                view === 'grid' ? 'bg-white text-neutral-950 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'
              }`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1" />
                <rect x="14" y="3.5" width="6.5" height="6.5" rx="1" />
                <rect x="3.5" y="14" width="6.5" height="6.5" rx="1" />
                <rect x="14" y="14" width="6.5" height="6.5" rx="1" />
              </svg>
            </button>
            <button
              type="button"
              aria-label="Show compact artwork list"
              aria-pressed={view === 'list'}
              onClick={() => setView('list')}
              className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                view === 'list' ? 'bg-white text-neutral-950 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'
              }`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <line x1="5" y1="6" x2="19" y2="6" />
                <line x1="5" y1="12" x2="19" y2="12" />
                <line x1="5" y1="18" x2="19" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className={view === 'grid' ? 'grid grid-cols-2 gap-3 sm:grid-cols-3' : 'space-y-2.5'}>
            {filteredItems.length === 0 ? (
              <div className="rounded-[20px] border border-neutral-100 bg-neutral-50 px-5 py-8 text-center text-[14px] text-neutral-500">
                {items.length === 0 ? 'No saved artworks yet.' : 'No artworks match your search.'}
              </div>
            ) : (
              filteredItems.map((item) => {
                const availability = getArtworkAvailability(item, currentSessionId);
                const isUnavailable = availability !== 'available';
                const availabilityLabel = availability === 'already-added'
                  ? 'Already added'
                  : availability === 'analyzing'
                    ? 'Analyzing…'
                    : null;
                const isSelected = currentSelectedIds.has(item.id);
                const limitReached = !isSelected && selectedCount >= maxSelection;

                const handleClick = () => {
                  if (!isUnavailable && !limitReached) toggleSelect(item);
                };

                if (view === 'grid') {
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={handleClick}
                      disabled={isUnavailable || limitReached}
                      className={`group relative overflow-hidden rounded-[18px] border text-left transition-all ${
                        isSelected
                          ? 'border-neutral-950 bg-neutral-950 shadow-[0_8px_20px_rgba(0,0,0,0.12)]'
                          : 'border-neutral-200 bg-white hover:-translate-y-0.5 hover:border-neutral-400 hover:shadow-[0_8px_20px_rgba(0,0,0,0.08)]'
                      } ${isUnavailable || limitReached ? 'cursor-not-allowed opacity-55' : ''}`}
                    >
                      <div className="relative flex h-32 items-center justify-center overflow-hidden bg-neutral-100 p-2">
                        <img src={item.thumbnailUrl || item.url} alt={item.artworkName || 'Artwork'} className="h-full w-full object-contain" />
                        {isSelected && (
                          <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-neutral-950 text-white shadow-sm">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          </div>
                        )}
                        {availabilityLabel && (
                          <span className="absolute bottom-2 left-2 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-semibold text-neutral-700 shadow-sm backdrop-blur">
                            {availabilityLabel}
                          </span>
                        )}
                      </div>
                      <div className={`px-3 pb-3 pt-2.5 ${isSelected ? 'bg-neutral-950' : ''}`}>
                        <p className={`truncate text-[14px] font-semibold ${isSelected ? 'text-white' : 'text-neutral-900'}`}>
                          {item.artworkName || 'Untitled'}
                        </p>
                        <p className={`mt-0.5 truncate text-[12px] ${isSelected ? 'text-neutral-300' : 'text-neutral-500'}`}>
                          {formatSecondaryMeta(item)}
                        </p>
                      </div>
                    </button>
                  );
                }

                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={handleClick}
                    disabled={isUnavailable || limitReached}
                    className={`flex w-full items-center gap-3 rounded-[20px] px-3.5 py-3 text-left transition-colors ${
                      isSelected ? 'bg-neutral-50' : 'hover:bg-neutral-50'
                    } ${isUnavailable || limitReached ? 'cursor-not-allowed opacity-55' : ''}`}
                  >
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-neutral-100">
                      <img src={item.thumbnailUrl || item.url} alt={item.artworkName || 'Artwork'} className="h-full w-full object-contain" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[16px] font-medium text-neutral-900">{item.artworkName || 'Untitled'}</p>
                      <p className="mt-0.5 truncate text-[13px] text-neutral-500">{formatSecondaryMeta(item)}</p>
                    </div>
                    {availabilityLabel && (
                      <span className="shrink-0 rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-semibold text-neutral-600">
                        {availabilityLabel}
                      </span>
                    )}
                    {isSelected && (
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-950 text-white">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-neutral-100 px-6 py-4">
          <div className="text-[15px] text-neutral-700">
            {selectedCount} selected
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="rounded-full border border-neutral-200 px-5 py-2.5 text-[15px] font-medium text-neutral-800 transition-colors hover:bg-neutral-50"
            >
              Cancel
            </button>
            <button
              onClick={() => onConfirm(currentSelectedItems)}
              disabled={selectedCount === 0}
              className="rounded-full bg-neutral-950 px-5 py-2.5 text-[15px] font-medium text-white transition-opacity disabled:opacity-35"
            >
              Add to chat
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
