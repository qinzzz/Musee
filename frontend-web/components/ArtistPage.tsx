import React, { useEffect, useState } from 'react';
import { ArtistEntity, GalleryItem } from '../types';
import { fetchArtistProfile, fetchArtistArtworks, resolveImageUrl, backfillArtworkArtist } from '../api/artworks';
import CanvasHeader from './CanvasHeader';

interface Props {
  artistEntityId?: string;
  artworkId?: string;       // used only when entity not yet linked (backfill path)
  artistName?: string;      // fallback display name
  userId: string;
  leftSlot?: React.ReactNode;
  onClose: () => void;
  onOpenArtwork: (item: GalleryItem) => void;
  onNavigateToIndex?: () => void; // navigate to /artists index
  parentLabel?: string;
  isInline?: boolean;
}

function toSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '_');
}

function rawToGalleryItem(raw: any): GalleryItem {
  return {
    id: raw.id,
    url: resolveImageUrl(raw.photo_uri),
    keywords: raw.artwork_tags?.map((t: any) => t.name) ?? [],
    vibe: raw.params?.vibe ?? { backgroundColor: '#1a1a1a', padding: 0, borderRadius: 'none', borderType: 'none', accentColor: '#888' },
    timestamp: raw.created_at ? new Date(raw.created_at).getTime() : 0,
    conversation: [],
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

export default function ArtistPage({ artistEntityId, artworkId, artistName, userId, leftSlot, onClose, onOpenArtwork, onNavigateToIndex, parentLabel, isInline }: Props) {
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

  // Push a clean URL when we know the artist name
  useEffect(() => {
    const name = artist?.display_name || artistName;
    if (name && !isInline) {
      window.history.pushState({}, '', `/artists/${toSlug(name)}`);
    }
  }, [artist?.display_name, artistName, isInline]);

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
      className={isInline ? "w-full h-full relative z-10 flex flex-col bg-[var(--color-bg-primary)] overflow-hidden" : "fixed inset-0 z-[1200] bg-[var(--color-bg-primary)] flex flex-col overflow-hidden"}
      style={{ fontFamily: 'var(--font-family-sans)' }}
    >
      {/* Header */}
      <CanvasHeader
        parentLabel={parentLabel || 'Artists'}
        parentClick={onNavigateToIndex || onClose}
        childLabel={artist?.display_name || artistName || '…'}
        leftSlot={leftSlot}
        isInline={isInline}
      />

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-5 py-6">

          {/* Artist identity */}
          <div className="flex items-center gap-4 mb-5">
            <div className="w-16 h-16 rounded-full shrink-0 overflow-hidden bg-[var(--color-surface-muted)] flex items-center justify-center">
              {artist?.profile_image_url ? (
                <img
                  src={artist.profile_image_url}
                  alt={displayName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-2xl font-semibold text-neutral-600">
                  {displayName[0]?.toUpperCase() ?? '?'}
                </span>
              )}
            </div>
            <div>
              <h1 className="text-neutral-900 text-2xl font-bold tracking-tight leading-tight">
                {displayName}
              </h1>
              {(artist?.nationality || lifespan) && (
                <p className="text-neutral-500 text-sm mt-1">
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
                  className="text-xs text-neutral-600 px-3 py-1 rounded-full bg-[var(--color-bg-tertiary)] border border-neutral-200/40"
                >
                  {m}
                </span>
              ))}
            </div>
          )}

          {/* Bio */}
          {isLoading ? (
            <p className="text-neutral-400 text-sm italic mb-6">Loading…</p>
          ) : artist?.bio ? (
            <p className="text-neutral-600 text-[15px] leading-relaxed mb-6">{artist.bio}</p>
          ) : (
            <p className="text-neutral-400 text-sm italic mb-6">No biography available.</p>
          )}

          {/* Divider */}
          <div className="border-t border-neutral-200 mb-5" />

          {/* Works section */}
          <h2 className="text-neutral-500 text-xs font-semibold tracking-widest uppercase mb-4">
            In your collection
            {artworks.length > 0 && <span className="ml-2 text-neutral-400 normal-case font-normal tracking-normal">({artworks.length})</span>}
          </h2>

          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="aspect-square rounded-xl bg-neutral-200/40 animate-pulse" />
              ))}
            </div>
          ) : artworks.length === 0 ? (
            <p className="text-neutral-400 text-sm italic">No artworks in your collection yet.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {artworks.map(item => (
                <button
                  key={item.id}
                  onClick={() => onOpenArtwork(item)}
                  className="relative aspect-square rounded-xl overflow-hidden bg-[var(--color-surface-muted)] group focus:outline-none border border-neutral-200/60"
                >
                  <img
                    src={item.url}
                    alt={item.artworkName || item.artistName || ''}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-[#171717]/85 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                    {item.artworkName && (
                      <p className="text-white text-xs font-medium leading-tight line-clamp-2">
                        {item.artworkName}
                      </p>
                    )}
                    {item.date && (
                      <p className="text-white/60 text-[10px] mt-0.5">{item.date}</p>
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
