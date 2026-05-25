import React, { useEffect, useState, useCallback } from 'react';
import { fetchSmartCollections, SmartCollection, resolveImageUrl } from '../apiService';

const RARITY_STYLE: Record<string, { label: string; classes: string }> = {
  common:    { label: 'Common',    classes: 'bg-neutral-100 text-neutral-500' },
  uncommon:  { label: 'Uncommon',  classes: 'bg-sky-50 text-sky-600' },
  rare:      { label: 'Rare',      classes: 'bg-violet-50 text-violet-600' },
  legendary: { label: 'Legendary', classes: 'bg-amber-50 text-amber-600' },
};

interface Props {
  userId: string | null;
  onSelect: (collection: SmartCollection) => void;
}

const SmartCollectionsView: React.FC<Props> = ({ userId, onSelect }) => {
  const [collections, setCollections] = useState<SmartCollection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
                  onClick={() => onSelect(col)}
                  className="text-left group"
                >
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
                  <p className="text-[12px] font-semibold text-neutral-900 leading-tight mb-1">{col.name}</p>
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
