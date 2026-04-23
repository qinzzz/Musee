import React, { useEffect, useState, useCallback } from 'react';
import { GalleryItem } from '../types';
import { fetchSmartCollections, SmartCollection, resolveImageUrl } from '../apiService';

const RARITY_STYLE: Record<string, { label: string; classes: string }> = {
  common:    { label: 'Common',    classes: 'bg-neutral-100 text-neutral-500' },
  uncommon:  { label: 'Uncommon',  classes: 'bg-sky-50 text-sky-600' },
  rare:      { label: 'Rare',      classes: 'bg-violet-50 text-violet-600' },
  legendary: { label: 'Legendary', classes: 'bg-amber-50 text-amber-600' },
};

interface Props {
  items: GalleryItem[];
  userId: string | null;
  onInterpret: (item: GalleryItem) => void;
}

const SmartCollectionsView: React.FC<Props> = ({ items, userId, onInterpret }) => {
  const [collections, setCollections] = useState<SmartCollection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SmartCollection | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSmartCollections(userId);
      setCollections(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const selectedItems = selected
    ? items.filter(i => selected.artwork_ids.includes(i.artworkId ?? i.id))
    : [];

  if (selected) {
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="shrink-0 flex items-center gap-3 px-5 sm:px-8 pt-4 pb-3 border-b border-neutral-100">
          <button
            onClick={() => setSelected(null)}
            className="flex items-center gap-1.5 text-neutral-400 hover:text-neutral-900 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            <span className="text-[10px] tracking-[0.15em] uppercase">Collections</span>
          </button>
          <span className="text-neutral-200 text-xs">/</span>
          <span className="text-[12px] font-semibold text-neutral-900">{selected.name}</span>
          <span className="text-[10px] text-neutral-400 ml-auto">{selected.artwork_count} works</span>
        </div>
        {/* Grid */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-8 pt-4 pb-32">
          <p className="text-[11px] text-neutral-400 mb-4">{selected.hook}</p>
          {selectedItems.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <p className="text-[10px] tracking-[0.3em] uppercase text-neutral-300">No loaded works match</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 sm:gap-3">
              {selectedItems.map(item => (
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
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-5 sm:px-8 pt-5 pb-32">
        {loading && (
          <div className="flex items-center justify-center h-48">
            <p className="text-[10px] tracking-[0.3em] uppercase text-neutral-300">Building collections…</p>
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center h-48">
            <p className="text-[10px] tracking-[0.3em] uppercase text-red-300">Failed to load</p>
          </div>
        )}

        {!loading && !error && collections.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 gap-2">
            <p className="text-[10px] tracking-[0.3em] uppercase text-neutral-300">No collections yet</p>
            <p className="text-[11px] text-neutral-400">Explore more artworks to unlock movement collections</p>
          </div>
        )}

        {!loading && collections.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 sm:gap-5">
            {collections.map(col => {
              const rarity = RARITY_STYLE[col.rarity] ?? RARITY_STYLE.common;
              return (
                <button
                  key={col.id}
                  onClick={() => setSelected(col)}
                  className="text-left group"
                >
                  {/* Cover grid */}
                  <div className="grid grid-cols-2 gap-0.5 bg-neutral-100 overflow-hidden rounded-xl aspect-square mb-2.5">
                    {col.cover_uris.slice(0, 4).map((uri, i) => (
                      <img
                        key={i}
                        src={resolveImageUrl(uri)}
                        alt=""
                        className="w-full h-full object-cover aspect-square"
                      />
                    ))}
                    {Array(Math.max(0, 4 - col.cover_uris.length)).fill(null).map((_, i) => (
                      <div key={`e${i}`} className="bg-neutral-100 aspect-square" />
                    ))}
                  </div>

                  {/* Name */}
                  <p className="text-[12px] font-semibold text-neutral-900 leading-tight mb-1">{col.name}</p>

                  {/* Rarity + hook */}
                  <div className="flex items-start gap-1.5">
                    <span className={`shrink-0 text-[8px] tracking-[0.15em] uppercase font-semibold px-1.5 py-0.5 rounded-full mt-px ${rarity.classes}`}>
                      {rarity.label}
                    </span>
                    <p className="text-[10px] text-neutral-400 leading-snug line-clamp-2">{col.hook}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default SmartCollectionsView;
