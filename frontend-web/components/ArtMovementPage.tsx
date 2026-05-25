import React, { useEffect } from 'react';
import { GalleryItem } from '../types';
import { SmartCollection } from '../apiService';

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
}

export default function ArtMovementPage({ collection, items, onClose, onOpenArtwork }: Props) {
  const collectionItems = items.filter(i =>
    collection.artwork_ids.includes(i.artworkId ?? i.id)
  );

  useEffect(() => {
    window.history.pushState({}, '', `/art-movements/${toSlug(collection.name)}`);
  }, [collection.name]);

  const rarity = RARITY_STYLE[collection.rarity] ?? RARITY_STYLE.common;

  return (
    <div
      className="fixed inset-0 z-[1200] bg-[#0e0e0e] flex flex-col overflow-hidden"
      style={{ fontFamily: 'system-ui, sans-serif' }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 pt-safe pt-4 pb-3 border-b border-white/10 shrink-0">
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors shrink-0"
          aria-label="Back"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className="flex items-center gap-1.5 text-sm min-w-0">
          <button onClick={onClose} className="text-white/40 hover:text-white/70 transition-colors whitespace-nowrap">
            Art Movements
          </button>
          <span className="text-white/20">/</span>
          <span className="text-white/70 truncate">{collection.name}</span>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-5 py-6">

          {/* Movement identity */}
          <div className="mb-5">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-white text-2xl font-bold tracking-tight">{collection.name}</h1>
              <span
                className="text-[10px] font-semibold tracking-wider uppercase px-2.5 py-1 rounded-full shrink-0"
                style={{ background: `${rarity.color}25`, color: rarity.color }}
              >
                {rarity.label}
              </span>
            </div>
            {collection.hook && (
              <p className="text-white/50 text-sm leading-relaxed">{collection.hook}</p>
            )}
          </div>

          {collection.description && (
            <p className="text-white/70 text-[15px] leading-relaxed mb-6">{collection.description}</p>
          )}

          <div className="border-t border-white/10 mb-5" />

          <h2 className="text-white/50 text-xs font-semibold tracking-widest uppercase mb-4">
            In your collection
            {collectionItems.length > 0 && (
              <span className="ml-2 text-white/30 normal-case font-normal tracking-normal">
                ({collectionItems.length})
              </span>
            )}
          </h2>

          {collectionItems.length === 0 ? (
            <p className="text-white/30 text-sm italic">No artworks loaded yet.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {collectionItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => onOpenArtwork(item)}
                  className="relative aspect-square rounded-xl overflow-hidden bg-[#1a1a1a] group focus:outline-none"
                >
                  <img
                    src={item.url}
                    alt={item.artworkName || item.artistName || ''}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                    {item.artworkName && (
                      <p className="text-white text-xs font-medium leading-tight line-clamp-2">{item.artworkName}</p>
                    )}
                    {item.artistName && (
                      <p className="text-white/50 text-[10px] mt-0.5">{item.artistName}</p>
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
