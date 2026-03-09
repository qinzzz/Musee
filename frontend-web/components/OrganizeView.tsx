
import React, { useState } from 'react';
import { GalleryItem, Visit, TagCoordinate, NeighborItem } from '../types';
import GridView from './GridView';
import AlbumView from './AlbumView';
import TopographyView from './TopographyView';

type SubLayout = 'grid' | 'album' | 'topography';

interface Props {
  items: GalleryItem[];
  visit: Visit;
  filteredVisitId: string | null;
  isAnalyzing: boolean;
  tagPositions: Record<string, TagCoordinate>;
  neighborItems: NeighborItem[];
  onInterpret: (item: GalleryItem) => void;
  onDelete: (id: string) => void;
}

const OrganizeView: React.FC<Props> = ({
  items,
  visit,
  filteredVisitId,
  isAnalyzing,
  tagPositions,
  neighborItems,
  onInterpret,
  onDelete,
}) => {
  const [layout, setLayout] = useState<SubLayout>('grid');

  return (
    <div className="w-full h-full relative overflow-hidden">
      {/* Content area */}
      <div className="w-full h-full overflow-hidden relative">
        {layout === 'grid' ? (
          <GridView
            items={items}
            visit={visit}
            filteredVisitId={filteredVisitId}
            isAnalyzing={isAnalyzing}
            onInterpret={onInterpret}
            onDelete={onDelete}
          />
        ) : layout === 'album' ? (
          <AlbumView
            items={items}
            onInterpret={onInterpret}
            onDelete={onDelete}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center p-8 sm:p-12 bg-white/80 backdrop-blur-md animate-in fade-in duration-500">
            <TopographyView
              items={items}
              cachedTagMap={tagPositions}
              neighborItems={neighborItems}
              onClose={() => setLayout('grid')}
            />
          </div>
        )}

        {items.length === 0 && layout !== 'topography' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-[10px] tracking-[0.3em] uppercase text-neutral-300">No pieces yet</p>
          </div>
        )}
      </div>

      {/* Sub-layout toggle — bottom center */}
      <div
        className="fixed left-1/2 -translate-x-1/2 z-30"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)' }}
      >
        <div className="flex items-center space-x-0.5 bg-white border border-neutral-200 rounded-full px-1.5 py-1 shadow-lg">
          {/* Grid */}
          <button
            onClick={() => setLayout('grid')}
            aria-label="Grid view"
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
              layout === 'grid' ? 'bg-neutral-900 text-white' : 'text-neutral-400 hover:text-neutral-700'
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill={layout === 'grid' ? 'white' : 'currentColor'} stroke="none">
              <circle cx="4.5" cy="4.5" r="2"/><circle cx="12" cy="4.5" r="2"/><circle cx="19.5" cy="4.5" r="2"/>
              <circle cx="4.5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19.5" cy="12" r="2"/>
              <circle cx="4.5" cy="19.5" r="2"/><circle cx="12" cy="19.5" r="2"/><circle cx="19.5" cy="19.5" r="2"/>
            </svg>
          </button>

          {/* Album */}
          <button
            onClick={() => setLayout('album')}
            aria-label="Album view"
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
              layout === 'album' ? 'bg-neutral-900 text-white' : 'text-neutral-400 hover:text-neutral-700'
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 5h18"/><rect x="3" y="9" width="7" height="6" rx="1"/><rect x="12" y="9" width="4" height="6" rx="1"/><rect x="18" y="9" width="3" height="6" rx="1"/><path d="M3 18h18"/>
            </svg>
          </button>

          {/* Topography */}
          <button
            onClick={() => setLayout('topography')}
            aria-label="Topography view"
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
              layout === 'topography' ? 'bg-neutral-900 text-white' : 'text-neutral-400 hover:text-neutral-700'
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <ellipse cx="12" cy="5" rx="9" ry="3"/>
              <path d="M3 5c0 5 18 5 18 0"/>
              <path d="M3 12c0 5 18 5 18 0"/>
              <path d="M3 19c0 5 18 5 18 0"/>
              <line x1="3" y1="5" x2="3" y2="19"/>
              <line x1="21" y1="5" x2="21" y2="19"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default OrganizeView;
