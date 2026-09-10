import type { MobileArtworkRecord } from './types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatTime(value: string | null | undefined, serverTime = false): string | null {
  const text = value?.trim();
  if (!text) return null;
  // EXIF-derived legacy records contain only a calendar date, not a time/zone.
  const legacy = /^([A-Za-z]{3}) (\d{1,2}), (\d{4})$/.exec(text);
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(text);
  let date: Date;
  if (legacy) {
    const month = MONTHS.indexOf(legacy[1]);
    if (month < 0) return null;
    date = new Date(Number(legacy[3]), month, Number(legacy[2]));
  } else if (dateOnly) {
    date = new Date(`${text}T00:00:00`);
  } else {
    const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text);
    // created_at is serialized as naive UTC; EXIF timestamps without a zone are local.
    date = new Date(serverTime && !hasZone ? `${text}Z` : text);
  }
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    ...(!legacy && !dateOnly ? { hour: 'numeric' as const, minute: '2-digit' as const } : {}),
  }).format(date);
}

export function artworkCaptureDetails(artwork: Pick<MobileArtworkRecord, 'museumName' | 'capturedAt' | 'createdAt'>) {
  const captured = formatTime(artwork.capturedAt);
  const added = captured ? null : formatTime(artwork.createdAt, true);
  return {
    museum: artwork.museumName?.trim() || 'Not recorded',
    timeLabel: captured || !added ? 'Captured' : 'Added',
    time: captured || added || 'Not recorded',
  };
}
