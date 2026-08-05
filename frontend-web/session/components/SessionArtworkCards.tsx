import React from 'react';
import type { GalleryItem } from '../../types';
import { MAX_SESSION_ARTWORK_BATCH_SIZE } from '../constants';

const UNTITLED_ARTWORK_LABEL = 'Untitled';
const UNKNOWN_ARTIST_LABEL = 'Artist unknown';
const ANALYZING_LABEL = 'Analyzing…';

type SessionArtworkCardsProps = {
  items: GalleryItem[];
  onOpenArtwork: (item: GalleryItem) => void;
};

function getArtworkTitle(item: GalleryItem): string {
  if (item.isAnalyzing && !item.artworkName?.trim()) return ANALYZING_LABEL;
  return item.artworkName?.trim() || UNTITLED_ARTWORK_LABEL;
}

function getArtworkAttribution(item: GalleryItem): string {
  const artist = item.artistName?.trim() || UNKNOWN_ARTIST_LABEL;
  const date = item.date?.trim();
  return date ? `${artist} · ${date}` : artist;
}

export default function SessionArtworkCards({ items, onOpenArtwork }: SessionArtworkCardsProps) {
  const count = items.length;
  const compositionCount = Math.min(count, MAX_SESSION_ARTWORK_BATCH_SIZE);

  return (
    <div
      className={`session-artwork-composition session-artwork-composition--${compositionCount}${count > 5 ? ' session-artwork-composition--many' : ''}`}
      data-artwork-count={count}
      aria-label={count === 1 ? 'Artwork' : `${count} artworks`}
    >
      {items.map((item, index) => {
        const title = item.isDeletedPlaceholder ? 'Deleted artwork' : getArtworkTitle(item);
        const attribution = getArtworkAttribution(item);
        const isUnavailable = Boolean(item.isDeletedPlaceholder || item.deleteStatus === 'pending');

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              if (isUnavailable) return;
              onOpenArtwork(item);
            }}
            className={`session-artwork-card group text-left ${isUnavailable ? 'cursor-default' : ''}`}
            style={{
              opacity: item.deleteStatus === 'pending' ? 0.45 : 1,
              zIndex: count - index,
            }}
            disabled={isUnavailable}
            aria-label={isUnavailable ? title : `Open ${title}, ${attribution}`}
          >
            <div className="session-artwork-card__image relative aspect-square">
              {item.isDeletedPlaceholder ? (
                <div className="flex h-full items-center justify-center bg-neutral-100 px-4 text-center text-neutral-400">
                  <p className="text-[12px] font-medium">Deleted artwork</p>
                </div>
              ) : (
                <img
                  src={item.url}
                  alt={title}
                  className={`h-full w-full object-cover ${item.deleteStatus === 'pending' ? 'saturate-[0.7]' : ''}`}
                />
              )}

              {item.isAnalyzing ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/70">
                  <div className="relative">
                    <div className="h-6 w-6 rounded-full border-2 border-neutral-100" />
                    <div className="absolute inset-0 h-6 w-6 animate-spin rounded-full border-t-2 border-neutral-600" />
                  </div>
                  <p className="text-[12px] font-medium text-neutral-500">Analyzing</p>
                </div>
              ) : null}
            </div>

            <div className="session-artwork-card__caption bg-white px-3.5 pb-3.5 pt-3 text-center">
              <p className="line-clamp-2 text-[14px] font-semibold leading-[1.25] text-neutral-900">
                {title}
              </p>
              {!item.isDeletedPlaceholder ? (
                <p className="mt-1 truncate text-[12px] leading-[1.35] text-neutral-500">
                  {attribution}
                </p>
              ) : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}
