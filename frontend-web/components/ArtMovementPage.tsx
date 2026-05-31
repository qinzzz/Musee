import React, { useEffect } from 'react';
import { GalleryItem } from '../types';
import { SmartCollection } from '../apiService';
import CanvasHeader from './CanvasHeader';

const RARITY_STYLE: Record<string, { label: string; color: string }> = {
  common:    { label: 'Common',    color: '#888888' },
  uncommon:  { label: 'Uncommon',  color: '#0ea5e9' },
  rare:      { label: 'Rare',      color: '#a78bfa' },
  legendary: { label: 'Legendary', color: '#f59e0b' },
};

function toSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '_');
}

interface Props {
  collection: SmartCollection;
  items: GalleryItem[];
  onClose: () => void;
  onOpenArtwork: (item: GalleryItem) => void;
  isInline?: boolean;
}

export default function ArtMovementPage({ collection, items, onClose, onOpenArtwork, isInline }: Props) {
  const collectionItems = items.filter(i =>
    collection.artwork_ids.includes(i.artworkId ?? i.id)
  );

  useEffect(() => {
    // Only push state if not rendered inline as part of the Collect tab
    if (!isInline) {
      window.history.pushState({}, '', `/art-movements/${toSlug(collection.name)}`);
    }
  }, [collection.name, isInline]);

  const rarity = RARITY_STYLE[collection.rarity] ?? RARITY_STYLE.common;

  return (
    <div
      className={isInline ? "w-full h-full relative z-10 flex flex-col bg-[#faf9f7] overflow-hidden" : "fixed inset-0 z-[1200] bg-[#faf9f7] flex flex-col overflow-hidden"}
      style={{ fontFamily: 'system-ui, sans-serif' }}
    >
      {/* Header */}
      <CanvasHeader
        parentLabel="Smart Collections"
        parentClick={onClose}
        childLabel={collection.name}
        isInline={isInline}
      />

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-5 py-6">

          {/* Movement identity */}
          <div className="mb-5">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-neutral-900 text-2xl font-bold tracking-tight">{collection.name}</h1>
              <span
                className="text-[10px] font-semibold tracking-wider uppercase px-2.5 py-1 rounded-full shrink-0"
                style={{ background: `${rarity.color}25`, color: rarity.color }}
              >
                {rarity.label}
              </span>
            </div>
            {collection.hook && (
              <p className="text-neutral-500 text-sm leading-relaxed">{collection.hook}</p>
            )}
          </div>

          {collection.description && (
            <p className="text-neutral-600 text-[15px] leading-relaxed mb-6">{collection.description}</p>
          )}

          <div className="border-t border-neutral-200 mb-5" />

          <h2 className="text-neutral-500 text-xs font-semibold tracking-widest uppercase mb-4">
            In your collection
            {collectionItems.length > 0 && (
              <span className="ml-2 text-neutral-400 normal-case font-normal tracking-normal">
                ({collectionItems.length})
              </span>
            )}
          </h2>

          {collectionItems.length === 0 ? (
            <p className="text-neutral-400 text-sm italic">No artworks loaded yet.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {collectionItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => onOpenArtwork(item)}
                  className="relative aspect-square rounded-xl overflow-hidden bg-[#f4efe4] group focus:outline-none border border-neutral-200/60"
                >
                  <img
                    src={item.url}
                    alt={item.artworkName || item.artistName || ''}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-[#171717]/85 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                    {item.artworkName && (
                      <p className="text-white text-xs font-medium leading-tight line-clamp-2">{item.artworkName}</p>
                    )}
                    {item.artistName && (
                      <p className="text-white/60 text-[10px] mt-0.5">{item.artistName}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
