import { expect, it } from 'vitest';
import { artworkCaptureDetails } from './artworkCapturePresentation';

it('uses capture time before the added time, preserving time-of-day when present', () => {
  const result = artworkCaptureDetails({ museumName: 'The Met', capturedAt: '2026-09-10T15:30:00Z', createdAt: '2026-09-11T18:00:00' });
  expect(result).toEqual({ museum: 'The Met', timeLabel: 'Captured', time: new Intl.DateTimeFormat(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date('2026-09-10T15:30:00Z')) });
});

it('does not invent a time for a legacy EXIF date', () => {
  const result = artworkCaptureDetails({ capturedAt: 'Sep 10, 2026', createdAt: null });
  expect(result.time).toBe(new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(2026, 8, 10)));
  expect(result.timeLabel).toBe('Captured');
});

it('labels the naive-UTC server timestamp Added when capture time is missing or invalid', () => {
  const result = artworkCaptureDetails({ capturedAt: 'invalid', createdAt: '2026-09-10T15:30:00' });
  expect(result.timeLabel).toBe('Added');
  expect(result.time).toBe(new Intl.DateTimeFormat(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date('2026-09-10T15:30:00Z')));
});

it('shows explicit missing values without Invalid Date', () => {
  expect(artworkCaptureDetails({ createdAt: null })).toEqual({ museum: 'Not recorded', timeLabel: 'Captured', time: 'Not recorded' });
});
