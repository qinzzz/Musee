
import React from 'react';
import { ArtworkWorkspace, GalleryItem, Album } from '../types';
import { Checkbox } from './ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';

const OverflowDotsIcon: React.FC<{ className?: string }> = ({ className = 'h-3.5 w-3.5' }) => (
  <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden="true">
    <circle cx="3" cy="8" r="1.25" />
    <circle cx="8" cy="8" r="1.25" />
    <circle cx="13" cy="8" r="1.25" />
  </svg>
);

interface Props {
  items: GalleryItem[];
  artworkWorkspace: ArtworkWorkspace;
  filteredSessionId: string | null;
  isAnalyzing: boolean;
  boards?: Album[];
  selectedIds: string[];
  hasSelectionOverlay?: boolean;
  onToggleSelection: (itemId: string) => void;
  onInterpret: (item: GalleryItem, contextItems?: GalleryItem[]) => void;
  onDelete: (id: string) => void;
}

const GridView: React.FC<Props> = ({
  items,
  artworkWorkspace,
  filteredSessionId,
  isAnalyzing,
  boards = [],
  selectedIds,
  hasSelectionOverlay = false,
  onToggleSelection,
  onInterpret,
  onDelete,
}) => {
  const suppressInterpretUntilRef = React.useRef(0);
  const displayItems = items;
  const isSelectionMode = selectedIds.length > 0;

  const suppressInterpret = React.useCallback((durationMs = 250) => {
    suppressInterpretUntilRef.current = Date.now() + durationMs;
  }, []);

  return (
    <div className="relative w-full">
      <div className={`px-4 pt-4 sm:px-8 md:px-0 md:pt-0 ${hasSelectionOverlay ? 'pb-28' : 'pb-4'}`}>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3 sm:gap-4">
          {displayItems.map(item => (
            (() => {
              const isPendingDelete = item.deleteStatus === 'pending';
              const isSelected = selectedIds.includes(item.id);

              return (
            <div
              key={item.id}
              className={`group relative aspect-square rounded bg-neutral-100 transition-opacity ${isPendingDelete ? 'cursor-default opacity-45' : 'cursor-pointer'}`}
              onClick={() => {
                if (isPendingDelete) return;
                if (Date.now() < suppressInterpretUntilRef.current) {
                  return;
                }
                if (isSelectionMode) {
                  onToggleSelection(item.id);
                  return;
                }
                onInterpret(item, displayItems);
              }}
            >
              <div className="absolute inset-0 overflow-hidden rounded">
              {/* Spinner only shows while analysis is ongoing */}
              {item.isAnalyzing && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-neutral-200 border-t-neutral-400 rounded-full animate-spin" />
                </div>
              )}
              <img
                src={item.url}
                alt={item.artworkName || ''}
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                className={`relative w-full h-full object-cover transition-all duration-300 ${isPendingDelete ? 'saturate-[0.7]' : 'group-hover:scale-105'} ${item.isAnalyzing ? 'blur-sm opacity-50' : ''} ${isSelected ? 'ring-2 ring-offset-[-2px] ring-neutral-900' : ''}`}
              />
              <div className={`absolute inset-0 bg-black/30 transition-opacity duration-200 flex flex-col justify-end p-1.5 ${isPendingDelete ? 'opacity-0' : 'opacity-0 group-hover:opacity-100'}`}>
                {item.artworkName && (
                  <p className="text-white text-[12px] font-medium leading-tight truncate">{item.artworkName}</p>
                )}
                {item.artistName && (
                  <p className="text-white/70 text-[10px] truncate">{item.artistName}</p>
                )}
              </div>
              </div>
              <Checkbox
                checked={isSelected}
                onClick={(e) => {
                  if (isPendingDelete) return;
                  e.stopPropagation();
                  onToggleSelection(item.id);
                }}
                className={`absolute top-2 left-2 z-20 ${isPendingDelete ? 'pointer-events-none opacity-0' : (!isSelected && !isSelectionMode ? 'opacity-0 group-hover:opacity-100' : 'opacity-100')}`}
                aria-label={selectedIds.includes(item.id) ? 'Deselect artwork' : 'Select artwork'}
              />
              {!isSelectionMode && !isPendingDelete && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        suppressInterpret();
                      }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        suppressInterpret();
                      }}
                      className="absolute top-2 right-2 z-30 flex h-7 w-7 items-center justify-center rounded-md border border-white/80 bg-black/35 text-white opacity-0 transition-opacity group-hover:opacity-100"
                      aria-label="Artwork actions"
                    >
                      <OverflowDotsIcon />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    className="min-w-[180px]"
                    onCloseAutoFocus={(event) => event.preventDefault()}
                  >
                    <DropdownMenuItem
                      destructive
                      onSelect={() => {
                        suppressInterpret(400);
                        onDelete(item.id);
                      }}
                    >
                      Delete artwork
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
              );
            })()
          ))}
        </div>
        {displayItems.length === 0 && !isAnalyzing && (
          <div className="flex items-center justify-center h-64">
            <p className="text-[12px] text-neutral-300">No artworks yet</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default GridView;
