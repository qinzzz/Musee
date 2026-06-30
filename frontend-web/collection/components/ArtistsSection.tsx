import type React from 'react';

import CollectionGridSkeleton from '../../components/CollectionGridSkeleton';
import type { ArtistRow } from '../../api/artworks';
import type { GalleryItem } from '../../types';

const ARTIST_CARD_MEDIA_HEIGHT = 'h-[200px] sm:h-[220px]';

const ArtistArtworkCluster: React.FC<{ works: GalleryItem[] }> = ({ works }) => {
  const visibleWorks = works.slice(0, 3);

  if (visibleWorks.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-[18px] bg-[var(--color-bg-tertiary)] text-neutral-300">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="M21 15l-5-5L5 21" />
        </svg>
      </div>
    );
  }

  if (visibleWorks.length === 1) {
    const [work] = visibleWorks;
    return (
      <div className="h-full min-h-0 overflow-hidden rounded-[18px] bg-[var(--color-bg-tertiary)]">
        <img src={work.url} alt={work.artworkName || work.artistName || ''} className="block h-full w-full object-cover" />
      </div>
    );
  }

  if (visibleWorks.length === 2) {
    return (
      <div className="grid h-full min-h-0 grid-rows-2 gap-1.5">
        {visibleWorks.map((work) => (
          <div key={work.id} className="min-h-0 overflow-hidden rounded-[18px] bg-[var(--color-bg-tertiary)]">
            <img src={work.url} alt={work.artworkName || work.artistName || ''} className="block h-full w-full object-cover" />
          </div>
        ))}
      </div>
    );
  }

  const [first, second, third] = visibleWorks;
  return (
    <div className="grid h-full min-h-0 grid-cols-2 grid-rows-[1.2fr_0.9fr] gap-1.5">
      <div className="col-span-2 min-h-0 overflow-hidden rounded-[18px] bg-[var(--color-bg-tertiary)]">
        <img src={first.url} alt={first.artworkName || first.artistName || ''} className="block h-full w-full object-cover" />
      </div>
      <div className="min-h-0 overflow-hidden rounded-[18px] bg-[var(--color-bg-tertiary)]">
        <img src={second.url} alt={second.artworkName || second.artistName || ''} className="block h-full w-full object-cover" />
      </div>
      <div className="min-h-0 overflow-hidden rounded-[18px] bg-[var(--color-bg-tertiary)]">
        <img src={third.url} alt={third.artworkName || third.artistName || ''} className="block h-full w-full object-cover" />
      </div>
    </div>
  );
};

type Props = {
  artistsLoading: boolean;
  artistsError: unknown;
  artists: ArtistRow[];
  normalizedCollectionSearch: string;
  items: GalleryItem[];
  onOpenArtist: (artistEntityId: string, artistName: string) => void;
};

export default function ArtistsSection({
  artistsLoading,
  artistsError,
  artists,
  normalizedCollectionSearch,
  items,
  onOpenArtist,
}: Props) {
  return (
    <div>
      <div className="px-4 pt-5 pb-32 sm:px-8 md:px-0">
        {artistsLoading ? (
          <CollectionGridSkeleton />
        ) : artistsError && artists.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2">
            <p className="text-[12px] text-neutral-300">Couldn&apos;t load artists</p>
            <p className="text-[11px] text-neutral-400">Try again in a moment.</p>
          </div>
        ) : artists.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2">
            <p className="text-[12px] text-neutral-300">{normalizedCollectionSearch ? 'No matching artists' : 'No artists yet'}</p>
            {!normalizedCollectionSearch && (
              <p className="text-[11px] text-neutral-400">Explore artworks to discover artists</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
            {artists.map((artist) => {
              const artistWorks = items
                .filter((item) => item.artistEntityId === artist.id && !item.isDeletedPlaceholder)
                .slice(0, 3);

              return (
                <button
                  key={artist.id}
                  onClick={() => onOpenArtist(artist.id, artist.display_name)}
                  className="group flex h-full flex-col rounded-[24px] border border-neutral-200 bg-white p-3 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all hover:border-neutral-300 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)]"
                >
                  <div className={`grid ${ARTIST_CARD_MEDIA_HEIGHT} min-h-0 grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] gap-2.5`}>
                    <div className="h-full min-h-0 overflow-hidden rounded-[20px] bg-[var(--color-bg-tertiary)]">
                      {artist.profile_image_url ? (
                        <img src={artist.profile_image_url} alt={artist.display_name} className="block h-full w-full object-cover object-center" />
                      ) : (
                        <div className="flex h-full items-center justify-center bg-[var(--color-bg-tertiary)]">
                          <span className="text-4xl font-semibold text-neutral-300">{artist.display_name[0]?.toUpperCase()}</span>
                        </div>
                      )}
                    </div>
                    <ArtistArtworkCluster works={artistWorks} />
                  </div>
                  <div className="mt-3 flex items-end justify-between gap-3 px-1">
                    <p className="min-w-0 truncate text-[13px] font-semibold leading-tight text-neutral-900">{artist.display_name}</p>
                    <span className="shrink-0 text-[11px] text-neutral-400">
                      {artist.artwork_count} {artist.artwork_count === 1 ? 'work' : 'works'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
