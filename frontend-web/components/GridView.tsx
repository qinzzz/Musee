
import React from 'react';
import { GalleryItem, Visit } from '../types';

interface Props {
  items: GalleryItem[];
  visit: Visit;
  filteredVisitId: string | null;
  isAnalyzing: boolean;
  onInterpret: (item: GalleryItem) => void;
  onDelete: (id: string) => void;
}

const GridView: React.FC<Props> = ({ items, visit, filteredVisitId, isAnalyzing, onInterpret, onDelete }) => {
  const activeId = filteredVisitId || (visit.active ? visit.id : null);
  const displayItems = activeId
    ? items.filter(i => i.visitId === activeId || (visit.active && visit.itemIds.includes(i.id)))
    : items;

  return (
    <div className="w-full h-full overflow-y-auto">
      <div className="px-4 sm:px-10 pt-6 pb-32">
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-1.5 sm:gap-2">
          {displayItems.map(item => (
            <div
              key={item.id}
              className="group relative aspect-square cursor-pointer overflow-hidden rounded bg-neutral-100"
              onClick={() => onInterpret(item)}
            >
              <img
                src={item.url}
                alt={item.artworkName || ''}
                className={`w-full h-full object-cover transition-all duration-300 group-hover:scale-105 ${item.isAnalyzing ? 'blur-sm opacity-50' : ''}`}
              />
              {item.isAnalyzing && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-neutral-300 border-t-neutral-700 rounded-full animate-spin" />
                </div>
              )}
              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end p-1.5">
                {item.artworkName && (
                  <p className="text-white text-[8px] font-medium leading-tight truncate">{item.artworkName}</p>
                )}
                {item.artistName && (
                  <p className="text-white/70 text-[7px] truncate">{item.artistName}</p>
                )}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-[8px] hover:bg-black/80 z-10"
              >
                ✕
              </button>
            </div>
          ))}
          {isAnalyzing && (
            <div className="aspect-square rounded bg-neutral-50 flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-neutral-200 border-t-neutral-500 rounded-full animate-spin" />
            </div>
          )}
        </div>
        {displayItems.length === 0 && !isAnalyzing && (
          <div className="flex items-center justify-center h-64">
            <p className="text-[10px] tracking-[0.3em] uppercase text-neutral-300">No pieces yet</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default GridView;
