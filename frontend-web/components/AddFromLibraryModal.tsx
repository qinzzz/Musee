import React from 'react';
import { createPortal } from 'react-dom';
import type { GalleryItem } from '../types';

type AddFromLibraryModalProps = {
  open: boolean;
  items: GalleryItem[];
  selectedIds: string[];
  searchValue: string;
  maxSelection?: number;
  onClose: () => void;
  onSearchChange: (value: string) => void;
  onToggleSelect: (item: GalleryItem) => void;
  onConfirm: () => void;
};

function formatSecondaryMeta(item: GalleryItem): string {
  if (item.artistName) return item.artistName;
  if (item.photoTime) return item.photoTime;
  return 'Saved artwork';
}

export default function AddFromLibraryModal({
  open,
  items,
  selectedIds,
  searchValue,
  maxSelection = 5,
  onClose,
  onSearchChange,
  onToggleSelect,
  onConfirm,
}: AddFromLibraryModalProps) {
  const dialogRef = React.useRef<HTMLDivElement | null>(null);

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

  const selectedCount = selectedIds.length;

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
        className="relative z-10 flex h-[min(640px,84vh)] w-full max-w-[840px] flex-col overflow-hidden rounded-[24px] border border-neutral-200 bg-white shadow-[0_24px_64px_rgba(0,0,0,0.12)]"
      >
        <div className="flex items-center justify-between px-6 pb-4 pt-6">
          <h2 className="text-[18px] font-semibold tracking-tight text-neutral-900">Add from library</h2>
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

        <div className="border-b border-neutral-100 px-6 pb-4">
          <input
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search library"
            className="w-full border-0 bg-transparent p-0 text-[16px] text-neutral-900 placeholder:text-neutral-400 outline-none"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="space-y-2.5">
            {filteredItems.length === 0 ? (
              <div className="rounded-[20px] border border-neutral-100 bg-neutral-50 px-5 py-8 text-center text-[14px] text-neutral-500">
                {items.length === 0 ? 'No saved artworks yet.' : 'No artworks match your search.'}
              </div>
            ) : (
              filteredItems.map((item) => {
                const isSelected = selectedIds.includes(item.id);
                const limitReached = !isSelected && selectedCount >= maxSelection;

                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      if (limitReached) return;
                      onToggleSelect(item);
                    }}
                    className={`flex w-full items-center gap-3 rounded-[20px] px-3.5 py-3 text-left transition-colors ${
                      isSelected
                        ? 'bg-neutral-50'
                        : 'hover:bg-neutral-50'
                    } ${limitReached ? 'opacity-50' : ''}`}
                  >
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-neutral-100">
                      <img src={item.url} alt={item.artworkName || 'Artwork'} className="h-full w-full object-cover" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[16px] font-medium text-neutral-900">
                        {item.artworkName || 'Untitled'}
                      </p>
                      <p className="mt-0.5 truncate text-[13px] text-neutral-500">
                        {formatSecondaryMeta(item)}
                      </p>
                    </div>
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center">
                      {isSelected ? (
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-950 text-white">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </div>
                      ) : (
                        <div className="h-7 w-7 rounded-full border border-transparent" />
                      )}
                    </div>
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
              onClick={onConfirm}
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
