import React from 'react';
import { type ArtistRow } from '../api/artworks';
import { useUserArtists } from '../hooks/useUserArtists';

interface Props {
  userId: string;
  onSelectArtist: (artist: ArtistRow) => void;
  onClose: () => void;
}

export default function ArtistsIndexPage({ userId, onSelectArtist, onClose }: Props) {
  const {
    artists,
    isLoading,
    error,
  } = useUserArtists({
    userId,
    enabled: true,
  });

  return (
    <div
      className="fixed inset-0 z-[var(--z-fullscreen-page)] bg-[var(--color-bg-primary)] flex flex-col overflow-hidden"
      style={{ fontFamily: 'var(--font-family-sans)' }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-safe pt-4 pb-3 border-b border-neutral-200/80 shrink-0">
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-neutral-200/50 transition-colors"
          aria-label="Back"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-700">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h1 className="text-neutral-900 text-base font-semibold tracking-tight">Artists</h1>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-4">
          {isLoading ? (
            <div className="space-y-3 mt-2">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-16 rounded-xl bg-neutral-200/40 animate-pulse" />
              ))}
            </div>
          ) : error && artists.length === 0 ? (
            <p className="text-neutral-400 text-sm italic mt-8 text-center">
              Couldn&apos;t load artists right now.
            </p>
          ) : artists.length === 0 ? (
            <p className="text-neutral-400 text-sm italic mt-8 text-center">
              No artists recorded yet.
            </p>
          ) : (
            <ul className="divide-y divide-neutral-200/60">
              {artists.map(artist => (
                <li key={artist.id}>
                  <button
                    onClick={() => onSelectArtist(artist)}
                    className="w-full flex items-center gap-4 py-4 hover:bg-[var(--color-bg-tertiary)] rounded-xl px-2 -mx-2 transition-colors text-left"
                  >
                    {/* Avatar */}
                    <div
                      className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 text-lg font-semibold text-neutral-600 bg-[var(--color-surface-muted)]"
                    >
                      {artist.display_name[0]?.toUpperCase() ?? '?'}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-neutral-900 text-[15px] font-medium truncate leading-tight">
                        {artist.display_name}
                      </p>
                      <p className="text-neutral-500 text-xs mt-0.5 truncate">
                        {[
                          artist.nationality,
                          artist.birth_year && artist.death_year
                            ? `${artist.birth_year}–${artist.death_year}`
                            : artist.birth_year
                            ? `b. ${artist.birth_year}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>

                    {/* Artwork count badge */}
                    <span className="text-neutral-400 text-xs shrink-0">
                      {artist.artwork_count} {artist.artwork_count === 1 ? 'work' : 'works'}
                    </span>

                    {/* Chevron */}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-300 shrink-0">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
