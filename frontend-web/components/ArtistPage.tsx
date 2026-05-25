import React, { useEffect, useState } from 'react';
import { ArtistEntity, GalleryItem } from '../types';
import { fetchArtistProfile, fetchArtistArtworks, resolveImageUrl, backfillArtworkArtist } from '../apiService';

interface Props {
  artistEntityId?: string;
  artworkId?: string;       // used only when entity not yet linked (backfill path)
  artistName?: string;      // fallback display name
  userId: string;
  onClose: () => void;
  onOpenArtwork: (item: GalleryItem) => void;
}

function rawToGalleryItem(raw: any): GalleryItem {
  return {
    id: raw.id,
    url: resolveImageUrl(raw.photo_uri),
    keywords: raw.artwork_tags?.map((t: any) => t.name) ?? [],
    vibe: raw.params?.vibe ?? { backgroundColor: '#1a1a1a', padding: 0, borderRadius: 'none', borderType: 'none', accentColor: '#888' },
    timestamp: raw.created_at ? new Date(raw.created_at).getTime() : 0,
    conversation: (raw.conversation_history ?? []).map((m: any) => ({ role: m.role, text: m.content })),
    artistName: raw.artist_name,
    artworkName: raw.artwork_name,
    description: raw.summary,
    artworkId: raw.id,
    date: raw.date,
    medium: raw.medium,
    movement: raw.movement,
    insights: raw.insights ?? [],
    artistEntityId: raw.artist_entity_id,
  };
}

export default function ArtistPage({ artistEntityId, artworkId, artistName, userId, onClose, onOpenArtwork }: Props) {
  const [artist, setArtist] = useState<ArtistEntity | null>(null);
  const [artworks, setArtworks] = useState<GalleryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      try {
        let entityId = artistEntityId;

        // Backfill path: artwork exists but entity not yet linked
        if (!entityId && artworkId) {
          const backfilled = await backfillArtworkArtist(artworkId);
          if (!cancelled && backfilled?.id) {
            entityId = backfilled.id;
            setArtist(backfilled);
          }
        }

        if (!entityId) return;

        const [profile, rawArtworks] = await Promise.all([
          artistEntityId ? fetchArtistProfile(entityId) : Promise.resolve(null),
          fetchArtistArtworks(entityId, userId),
        ]);

        if (!cancelled) {
          if (profile) setArtist(profile);
          setArtworks(rawArtworks.map(rawToGalleryItem));
        }
      } catch {
        // silently fail — page still renders with what it has
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [artistEntityId, artworkId, userId]);

  const lifespan = (() => {
    if (!artist) return null;
    const { birth_year, death_year } = artist;
    if (birth_year && death_year) return `${birth_year}–${death_year}`;
    if (birth_year) return `b. ${birth_year}`;
    return null;
  })();

  const displayName = artist?.display_name || artistName || 'Unknown Artist';

  return (
    <div
      className="fixed inset-0 z-[1200] bg-[#0e0e0e] flex flex-col overflow-hidden"
      style={{ fontFamily: 'system-ui, sans-serif' }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-safe pt-4 pb-3 border-b border-white/10 shrink-0">
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
          aria-label="Back"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <span className="text-white/50 text-sm tracking-wide">Artist</span>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-5 py-6">

          {/* Artist identity */}
          <div className="flex items-center gap-4 mb-5">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center shrink-0 text-2xl font-semibold text-white/60"
              style={{ background: '#252525' }}
            >
              {displayName[0]?.toUpperCase() ?? '?'}
            </div>
            <div>
              <h1 className="text-white text-2xl font-bold tracking-tight leading-tight">
                {displayName}
              </h1>
              {(artist?.nationality || lifespan) && (
                <p className="text-white/50 text-sm mt-1">
                  {[artist?.nationality, lifespan].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
          </div>

          {/* Movement chips */}
          {artist?.movements && artist.movements.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-5">
              {artist.movements.map(m => (
                <span
                  key={m}
                  className="text-xs text-white/60 px-3 py-1 rounded-full"
                  style={{ background: '#252525' }}
                >
                  {m}
                </span>
              ))}
            </div>
          )}

          {/* Bio */}
          {isLoading ? (
            <p className="text-white/30 text-sm italic mb-6">Loading…</p>
          ) : artist?.bio ? (
            <p className="text-white/70 text-[15px] leading-relaxed mb-6">{artist.bio}</p>
          ) : (
            <p className="text-white/30 text-sm italic mb-6">No biography available.</p>
          )}

          {/* Divider */}
          <div className="border-t border-white/10 mb-5" />

          {/* Works section */}
          <h2 className="text-white/50 text-xs font-semibold tracking-widest uppercase mb-4">
            In your collection
            {artworks.length > 0 && <span className="ml-2 text-white/30 normal-case font-normal tracking-normal">({artworks.length})</span>}
          </h2>

          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="aspect-square rounded-xl bg-white/5 animate-pulse" />
              ))}
            </div>
          ) : artworks.length === 0 ? (
            <p className="text-white/30 text-sm italic">No artworks in your collection yet.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {artworks.map(item => (
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
                      <p className="text-white text-xs font-medium leading-tight line-clamp-2">
                        {item.artworkName}
                      </p>
                    )}
                    {item.date && (
                      <p className="text-white/50 text-[10px] mt-0.5">{item.date}</p>
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
