import { describe, expect, it } from 'vitest';
import type { SessionSummary } from '../types';
import { formatSessionRecency, formatSessionSummaryMeta } from './sessionSummaryPresentation';

const NOW = new Date(2026, 7, 5, 12).getTime();

function createSummary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: 'session-1',
    title: 'Session',
    location: null,
    artworkCount: 0,
    updatedAt: NOW,
    dateLabel: null,
    items: [],
    ...overrides,
  };
}

describe('session summary presentation', () => {
  it('formats recency using calendar-friendly labels', () => {
    expect(formatSessionRecency(NOW, NOW)).toBe('Today');
    expect(formatSessionRecency(new Date(2026, 7, 4, 8).getTime(), NOW)).toBe('Yesterday');
    expect(formatSessionRecency(new Date(2026, 6, 30, 8).getTime(), NOW)).toBe('Jul 30');
    expect(formatSessionRecency(new Date(2025, 11, 20, 8).getTime(), NOW)).toBe('Dec 20, 2025');
  });

  it('shows draft state instead of a zero artwork count', () => {
    expect(formatSessionSummaryMeta(createSummary(), NOW)).toBe('Draft · Today');
  });

  it('summarizes recognizable artists and remaining unique artists', () => {
    const summary = createSummary({
      artworkCount: 4,
      items: [
        { artistName: "Georgia O'Keeffe" },
        { artistName: 'Henri Matisse' },
        { artistName: "Georgia O'Keeffe" },
        { artistName: 'Anish Kapoor' },
      ] as SessionSummary['items'],
    });

    expect(formatSessionSummaryMeta(summary, NOW)).toBe("Today · Georgia O'Keeffe, Henri Matisse +1");
  });

  it('uses processing state or an artwork title when artist metadata is unavailable', () => {
    expect(formatSessionSummaryMeta(createSummary({
      artworkCount: 1,
      items: [{ isAnalyzing: true }] as SessionSummary['items'],
    }), NOW)).toBe('Analyzing 1 artwork…');

    expect(formatSessionSummaryMeta(createSummary({
      artworkCount: 1,
      items: [{ artworkName: 'Cloud Gate', artistName: 'Unknown Artist' }] as SessionSummary['items'],
    }), NOW)).toBe('Today · Cloud Gate');
  });
});
