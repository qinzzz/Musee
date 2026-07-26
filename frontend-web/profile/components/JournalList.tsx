import React from 'react';

import { resolveImageUrl } from '../../api/core';
import type { JournalArtworkPreview, JournalListItem } from '../../api/journals';

interface Props {
  journals: JournalListItem[];
  loading?: boolean;
  error?: string | null;
}

const JOURNAL_TIMING_MESSAGE = 'Your journal appears here overnight.';

const formatJournalDate = (value: string): string => {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('en', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed);
};

const JournalArtworkImages: React.FC<{ artworks: JournalArtworkPreview[] }> = ({ artworks }) => {
  const [failedIds, setFailedIds] = React.useState<Set<string>>(new Set());
  const visibleArtworks = artworks.filter((artwork) => !failedIds.has(artwork.id)).slice(0, 2);

  if (visibleArtworks.length === 0) return null;

  const isPair = visibleArtworks.length === 2;
  return (
    <div
      className={`relative mt-5 w-full max-w-[280px] ${
        isPair ? 'h-[190px]' : 'h-[170px]'
      }`}
      aria-label="Representative artworks"
    >
      {visibleArtworks.map((artwork, index) => {
        const pairPosition = index === 0
          ? 'left-0 top-0 h-[82%] w-[72%]'
          : 'bottom-0 right-0 h-[82%] w-[72%]';
        return (
          <img
            key={artwork.id}
            src={resolveImageUrl(artwork.photo_uri)}
            alt={`${artwork.artwork_name} by ${artwork.artist_name}`}
            loading="lazy"
            decoding="async"
            onError={() => {
              setFailedIds((current) => new Set(current).add(artwork.id));
            }}
            className={`absolute rounded-[12px] border-4 border-white object-cover shadow-sm ${
              isPair ? pairPosition : 'inset-0 h-full w-full'
            }`}
          />
        );
      })}
    </div>
  );
};

const JournalList: React.FC<Props> = ({
  journals,
  loading = false,
  error = null,
}) => (
  <section aria-labelledby="journal-heading" className="mb-10">
    <p className="text-[11px] font-medium text-neutral-400">Daily memory</p>
    <h1 id="journal-heading" className="mt-3 text-[34px] font-semibold leading-tight text-neutral-900">
      Journal
    </h1>
    <p className="mt-2 text-[13px] text-neutral-400">{JOURNAL_TIMING_MESSAGE}</p>

    {loading ? (
      <p className="mt-5 text-[13px] text-neutral-400">Loading journals…</p>
    ) : error ? (
      <p className="mt-5 text-[13px] text-neutral-500">{error}</p>
    ) : journals.length === 0 ? (
      null
    ) : (
      <div className="mt-7 border-t border-neutral-200">
        {journals.map((journal) => (
          <article
            key={journal.id}
            className="grid gap-3 border-b border-neutral-200 py-6 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-8"
          >
            <div>
              <time
                dateTime={journal.local_date}
                className="block text-[12px] font-medium text-neutral-900"
              >
                {formatJournalDate(journal.local_date)}
              </time>
              {journal.location ? (
                <p className="mt-1 text-[11px] leading-5 text-neutral-400">
                  {journal.location}
                </p>
              ) : null}
            </div>
            <div>
              <p className="font-serif text-[16px] leading-8 text-neutral-700">
                {journal.reflection}
              </p>
              <JournalArtworkImages artworks={journal.representative_artworks || []} />
            </div>
          </article>
        ))}
      </div>
    )}
  </section>
);

export default JournalList;
