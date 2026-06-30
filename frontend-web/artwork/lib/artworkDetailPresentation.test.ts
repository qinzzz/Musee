import { describe, expect, it } from 'vitest';

import {
  buildArtworkSessionMemberships,
  formatArtworkDisplayDate,
  getArtworkDisplayLocation,
  parseArtworkStreamingFields,
} from './artworkDetailPresentation';

describe('artworkDetailPresentation helpers', () => {
  it('formats structured location objects and json strings', () => {
    expect(
      getArtworkDisplayLocation({ museum: 'MoMA', city: 'New York', country: 'USA' }),
    ).toBe('MoMA, New York, USA');

    expect(
      getArtworkDisplayLocation('{"museum":"MoMA","city":"New York","country":"USA"}'),
    ).toBe('MoMA, New York, USA');
  });

  it('formats display dates without time noise', () => {
    expect(formatArtworkDisplayDate('2026-06-26T08:00:00.000Z')).toMatch(/2026/);
    expect(formatArtworkDisplayDate('Jun 20, 2026, 08:30')).toBe('Jun 20, 2026');
  });

  it('parses streaming artwork fields from partial json text', () => {
    const parsed = parseArtworkStreamingFields({
      isAnalyzing: true,
      streamingText:
        'thinking... {"artist":"Claude Monet","title":"Water Lilies","description":"A luminous pond study."}',
    });

    expect(parsed?.artist).toBe('Claude Monet');
    expect(parsed?.title).toBe('Water Lilies');
    expect(parsed?.description).toBe('A luminous pond study.');
  });

  it('builds unique session memberships with fallback titles', () => {
    const memberships = buildArtworkSessionMemberships(
      [
        { sessionId: 'session-1' },
        { sessionId: 'session-1' },
        { sessionId: 'session-2' },
      ],
      { 'session-1': 'Morning at MoMA' },
    );

    expect(memberships).toEqual([
      { sessionId: 'session-1', title: 'Morning at MoMA' },
      { sessionId: 'session-2', title: 'Untitled Session' },
    ]);
  });
});
