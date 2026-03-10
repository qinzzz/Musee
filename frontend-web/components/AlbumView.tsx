
import React, { useState, useMemo } from 'react';
import { GalleryItem } from '../types';

type GroupBy = 'location' | 'date' | 'tags';

interface AlbumGroup {
  key: string;
  label: string;
  items: GalleryItem[];
}

interface Props {
  items: GalleryItem[];
  onInterpret: (item: GalleryItem) => void;
  onDelete: (id: string) => void;
}

const parseLocationLabel = (location: any): string | null => {
  if (!location) return null;
  try {
    const data = typeof location === 'string' ? JSON.parse(location) : location;
    if (data.museum) return data.city ? `${data.museum}, ${data.city}` : data.museum;
    if (data.city) return data.country ? `${data.city}, ${data.country}` : data.city;
    if (data.country) return data.country;
  } catch {}
  return typeof location === 'string' && !location.startsWith('{') ? location : null;
};

const parseDateLabel = (photoTime: string | undefined): string => {
  if (!photoTime) return 'Unknown Date';
  try {
    // ISO format
    if (photoTime.includes('T') || photoTime.match(/^\d{4}-\d{2}-\d{2}/)) {
      const dt = new Date(photoTime);
      if (!isNaN(dt.getTime())) {
        return dt.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      }
    }
    // "Mar 8, 2026" style
    const dt = new Date(photoTime);
    if (!isNaN(dt.getTime())) {
      return dt.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    // Try to extract year
    const yearMatch = photoTime.match(/\b(20\d{2})\b/);
    if (yearMatch) return yearMatch[1];
  } catch {}
  return photoTime;
};

const AlbumView: React.FC<Props> = ({ items, onInterpret, onDelete }) => {
  const [groupBy, setGroupBy] = useState<GroupBy>('location');

  const groups = useMemo((): AlbumGroup[] => {
    const groupMap = new Map<string, GalleryItem[]>();

    items.forEach(item => {
      let keys: string[];
      if (groupBy === 'location') {
        const loc = parseLocationLabel(item.location);
        keys = [loc || 'Unknown Location'];
      } else if (groupBy === 'date') {
        keys = [parseDateLabel(item.photoTime)];
      } else {
        keys = item.keywords && item.keywords.length > 0 ? item.keywords : ['Untagged'];
      }

      keys.forEach(key => {
        if (!groupMap.has(key)) groupMap.set(key, []);
        groupMap.get(key)!.push(item);
      });
    });

    const sorted = Array.from(groupMap.entries()).map(([key, groupItems]) => ({
      key,
      label: key,
      items: groupItems,
    }));

    if (groupBy === 'date') {
      sorted.sort((a, b) => {
        if (a.key === 'Unknown Date') return 1;
        if (b.key === 'Unknown Date') return -1;
        const da = new Date(a.key);
        const db = new Date(b.key);
        if (!isNaN(da.getTime()) && !isNaN(db.getTime())) return db.getTime() - da.getTime();
        return b.key.localeCompare(a.key);
      });
    } else {
      sorted.sort((a, b) => {
        const aUnknown = a.key === 'Unknown Location' || a.key === 'Unknown Date' || a.key === 'Untagged';
        const bUnknown = b.key === 'Unknown Location' || b.key === 'Unknown Date' || b.key === 'Untagged';
        if (aUnknown && !bUnknown) return 1;
        if (!aUnknown && bUnknown) return -1;
        return b.items.length - a.items.length;
      });
    }

    return sorted;
  }, [items, groupBy]);

  return (
    <div className="w-full h-full overflow-y-auto">
      {/* GroupBy selector */}
      <div className="sticky top-0 z-10 bg-[#fdfdfd]/95 backdrop-blur-md px-4 sm:px-10 py-3 flex items-center space-x-1 border-b border-neutral-100">
        {(['location', 'date', 'tags'] as GroupBy[]).map(option => (
          <button
            key={option}
            onClick={() => setGroupBy(option)}
            className={`px-3 py-1 rounded-full text-[9px] tracking-[0.2em] uppercase font-medium transition-all ${
              groupBy === option
                ? 'bg-neutral-900 text-white'
                : 'text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100'
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      <div className="px-4 sm:px-10 pb-32 space-y-10 pt-6">
        {groups.map(group => (
          <div key={group.key}>
            <div className="flex items-baseline space-x-2 mb-3 pb-2 border-b border-neutral-100">
              <h2 className="font-serif text-base sm:text-lg text-neutral-800">{group.label}</h2>
              <span className="text-[9px] tracking-[0.2em] uppercase text-neutral-400">
                {group.items.length} {group.items.length === 1 ? 'piece' : 'pieces'}
              </span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2.5 sm:gap-3.5">
              {group.items.map(item => (
                <div
                  key={item.id + group.key}
                  className="group relative aspect-square cursor-pointer overflow-hidden rounded-sm bg-neutral-100"
                  onClick={() => onInterpret(item)}
                >
                  <img
                    src={item.url}
                    alt={item.artworkName || ''}
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    className="w-full h-full object-cover transition-all duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
                    className="absolute top-1 right-1 w-4 h-4 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-[7px] hover:bg-black/80 z-10"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
        {groups.length === 0 && (
          <div className="flex items-center justify-center h-64">
            <p className="text-[10px] tracking-[0.3em] uppercase text-neutral-300">No pieces yet</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AlbumView;
