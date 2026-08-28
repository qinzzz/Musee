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

    expect(
      getArtworkDisplayLocation(
        { museum: 'J. Paul Getty Museum', city: 'Los Angeles', country: 'United States' },
        'Getty Center',
      ),
    ).toBe('Getty Center, Los Angeles, United States');

    expect(getArtworkDisplayLocation(null, 'Getty Center')).toBe('Getty Center');
  });

  it('never renders raw json when location fields are empty', () => {
    const unresolved =
      '{"city":"","country":"","museum":"","latitude":40.778,"longitude":-73.963,"raw":""}';
    expect(getArtworkDisplayLocation(unresolved)).toBeNull();
    expect(
      getArtworkDisplayLocation({ city: '', country: '', museum: '', latitude: 40.778, longitude: -73.963, raw: '' }),
    ).toBeNull();
    // Malformed json-ish strings should be hidden, not shown verbatim
    expect(getArtworkDisplayLocation('{"city":"New York",')).toBeNull();
    // Falls back to raw display name when only raw is populated
    expect(getArtworkDisplayLocation('{"city":"","raw":"Fifth Avenue, New York"}')).toBe(
      'Fifth Avenue, New York',
    );
    // Plain human-entered strings still pass through
    expect(getArtworkDisplayLocation('The Met, New York')).toBe('The Met, New York');
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
