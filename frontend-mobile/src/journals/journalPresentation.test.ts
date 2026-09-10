import { expect, it } from 'vitest';
import { formatJournalDate } from './journalPresentation';

it('renders the saved calendar day without shifting it to the previous day', () => {
  expect(formatJournalDate('2026-09-08')).toBe(new Intl.DateTimeFormat(undefined, {
    month: 'long', day: 'numeric', year: 'numeric',
  }).format(new Date(2026, 8, 8)));
});

it('keeps an unrecognized date readable', () => {
  expect(formatJournalDate('unknown')).toBe('unknown');
});
