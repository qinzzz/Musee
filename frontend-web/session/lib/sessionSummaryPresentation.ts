import type { SessionSummary } from '../types';
import { isKnownArtistName } from './commentary';

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const MAX_VISIBLE_ARTISTS = 2;
const ANALYZING_LABEL = 'Analyzing';
const DETAILS_PENDING_LABEL = 'Artwork details pending';

function getLocalDayTimestamp(timestamp: number): number {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function formatSessionRecency(updatedAt: number, now = Date.now()): string {
  const updatedDate = new Date(updatedAt);
  const currentDate = new Date(now);
  const dayDifference = Math.round(
    (getLocalDayTimestamp(now) - getLocalDayTimestamp(updatedAt)) / DAY_IN_MS,
  );

  if (dayDifference <= 0) return 'Today';
  if (dayDifference === 1) return 'Yesterday';

  return updatedDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(updatedDate.getFullYear() === currentDate.getFullYear() ? {} : { year: 'numeric' }),
  });
}

export function formatSessionSummaryMeta(summary: SessionSummary, now = Date.now()): string {
  const recency = formatSessionRecency(summary.updatedAt, now);
  const analyzingCount = summary.items.filter((item) => item.isAnalyzing).length;

  if (analyzingCount > 0) {
    return `${ANALYZING_LABEL} ${analyzingCount} ${analyzingCount === 1 ? 'artwork' : 'artworks'}…`;
  }

  if (summary.artworkCount === 0) {
    return recency;
  }

  const artists = Array.from(new Set(
    summary.items
      .map((item) => item.artistName?.trim())
      .filter((artist): artist is string => isKnownArtistName(artist)),
  ));

  if (artists.length > 0) {
    const visibleArtists = artists.slice(0, MAX_VISIBLE_ARTISTS);
    const remainingCount = artists.length - visibleArtists.length;
    return `${recency} · ${visibleArtists.join(', ')}${remainingCount > 0 ? ` +${remainingCount}` : ''}`;
  }

  const artworkTitle = summary.items.find((item) => item.artworkName?.trim())?.artworkName?.trim();
  return `${recency} · ${artworkTitle || DETAILS_PENDING_LABEL}`;
}
