import type React from 'react';

import type { UserMuseumSummary } from '../../api/museums';
import CollectionGridSkeleton from '../../components/CollectionGridSkeleton';
import type { GalleryItem } from '../../types';

type Props = {
  museums: UserMuseumSummary[];
  museumsLoading: boolean;
  museumsError: unknown;
  normalizedCollectionSearch: string;
  selectedMuseumId: string | null;
  items: GalleryItem[];
  onSelectMuseum: (museumId: string | null) => void;
  onInterpret: (item: GalleryItem, context: { items: GalleryItem[]; label: string; basePath?: string }) => void;
};

function formatRecordedDate(value: string | null): string | null {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function artworkForId(items: GalleryItem[], artworkId: string): GalleryItem | undefined {
  return items.find((item) => (item.artworkId || item.id) === artworkId && !item.isDeletedPlaceholder);
}

const MuseumArtworkCluster: React.FC<{ works: GalleryItem[]; venueImage?: string | null; name: string }> = ({
  works,
  venueImage,
  name,
}) => {
  if (venueImage) {
    return <img src={venueImage} alt={name} className="block h-full w-full object-cover" />;
  }
  const visibleWorks = works.slice(0, 3);
  if (visibleWorks.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--color-bg-tertiary)]">
        <span className="text-5xl font-semibold text-neutral-300">{name[0]?.toUpperCase()}</span>
      </div>
    );
  }
  if (visibleWorks.length === 1) {
    return <img src={visibleWorks[0].thumbnailUrl || visibleWorks[0].url} alt={visibleWorks[0].artworkName || name} className="block h-full w-full object-cover" />;
  }
  return (
    <div className="grid h-full grid-cols-2 gap-1.5">
      <div className="h-full min-h-0 overflow-hidden">
        <img src={visibleWorks[0].thumbnailUrl || visibleWorks[0].url} alt={visibleWorks[0].artworkName || name} className="block h-full w-full object-cover" />
      </div>
      <div className="grid min-h-0 grid-rows-2 gap-1.5">
        {visibleWorks.slice(1).map((work) => (
          <div key={work.id} className="min-h-0 overflow-hidden bg-[var(--color-bg-tertiary)]">
            <img src={work.thumbnailUrl || work.url} alt={work.artworkName || name} className="block h-full w-full object-cover" />
          </div>
        ))}
      </div>
    </div>
  );
};

export default function MuseumsSection({
  museums,
  museumsLoading,
  museumsError,
  normalizedCollectionSearch,
  selectedMuseumId,
  items,
  onSelectMuseum,
  onInterpret,
}: Props) {
  const filteredMuseums = museums.filter((entry) =>
    entry.museum.canonical_name.toLowerCase().includes(normalizedCollectionSearch),
  );
  const selectedMuseum = museums.find((entry) => entry.museum.id === selectedMuseumId) || null;

  if (selectedMuseum) {
    const museumWorks = selectedMuseum.artwork_ids
      .map((id) => artworkForId(items, id))
      .filter((item): item is GalleryItem => Boolean(item));
    return (
      <div className="px-4 pb-32 pt-5 sm:px-8 md:px-0">
        <button
          type="button"
          onClick={() => onSelectMuseum(null)}
          className="mb-5 inline-flex items-center gap-2 text-[12px] font-medium text-neutral-500 hover:text-neutral-900"
        >
          <span aria-hidden="true">←</span> All museums
        </button>
        <div className="mb-6">
          <h2 className="text-[24px] font-semibold tracking-[-0.02em] text-neutral-900">{selectedMuseum.museum.canonical_name}</h2>
          <p className="mt-1 text-[12px] text-neutral-400">
            {selectedMuseum.artwork_count} {selectedMuseum.artwork_count === 1 ? 'artwork' : 'artworks'} recorded
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          {museumWorks.map((work) => (
            <button
              key={work.id}
              type="button"
              onClick={() => onInterpret(work, {
                items: museumWorks,
                label: selectedMuseum.museum.canonical_name,
                basePath: `/museums?museum=${encodeURIComponent(selectedMuseum.museum.id)}`,
              })}
              className="group overflow-hidden rounded-[18px] bg-[var(--color-bg-tertiary)] text-left"
            >
              <div className="aspect-square overflow-hidden">
                <img src={work.thumbnailUrl || work.url} alt={work.artworkName || 'Artwork'} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
              </div>
              <div className="bg-white px-1 py-2">
                <p className="truncate text-[12px] font-medium text-neutral-800">{work.artworkName || 'Untitled'}</p>
                <p className="truncate text-[11px] text-neutral-400">{work.artistName || 'Unknown artist'}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pb-32 pt-5 sm:px-8 md:px-0">
      {museumsLoading ? (
        <CollectionGridSkeleton />
      ) : museumsError && museums.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center gap-2">
          <p className="text-[12px] text-neutral-300">Couldn&apos;t load museums</p>
          <p className="text-[11px] text-neutral-400">Try again in a moment.</p>
        </div>
      ) : filteredMuseums.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center gap-2 text-center">
          <p className="text-[12px] text-neutral-300">{normalizedCollectionSearch ? 'No matching museums' : 'No museums recorded yet'}</p>
          {!normalizedCollectionSearch && <p className="text-[11px] text-neutral-400">Artworks captured at recognized museums will appear here.</p>}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
          {filteredMuseums.map((entry) => {
            const covers = entry.cover_artwork_ids
              .map((id) => artworkForId(items, id))
              .filter((item): item is GalleryItem => Boolean(item));
            return (
              <button
                key={entry.museum.id}
                type="button"
                onClick={() => onSelectMuseum(entry.museum.id)}
                className="group overflow-hidden rounded-[24px] border border-neutral-200 bg-white p-3 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all hover:border-neutral-300 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)]"
              >
                <div className="h-[220px] overflow-hidden rounded-[18px] bg-[var(--color-bg-tertiary)]">
                  <MuseumArtworkCluster works={covers} venueImage={entry.museum.thumbnail_url} name={entry.museum.canonical_name} />
                </div>
                <div className="px-1 pb-1 pt-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 truncate text-[14px] font-semibold text-neutral-900">{entry.museum.canonical_name}</p>
                    <span className="shrink-0 text-[11px] text-neutral-400">{entry.artwork_count} {entry.artwork_count === 1 ? 'work' : 'works'}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-neutral-400">
                    {entry.first_recorded_on === entry.last_recorded_on
                      ? `Recorded ${formatRecordedDate(entry.first_recorded_on) || 'recently'}`
                      : `${formatRecordedDate(entry.first_recorded_on) || 'Unknown'} – ${formatRecordedDate(entry.last_recorded_on) || 'Unknown'}`}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
