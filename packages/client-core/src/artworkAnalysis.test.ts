import { describe, expect, it } from 'vitest';

import { parseArtworkAnalysisStreamEvent } from './artworkAnalysis';

describe('artwork analysis stream contract', () => {
  it('parses streamed text chunks', () => {
    expect(parseArtworkAnalysisStreamEvent({
      event: 'chunk',
      data: JSON.stringify({ type: 'text', content: 'Looking closely…' }),
    })).toEqual({ type: 'chunk', content: 'Looking closely…' });
  });

  it('normalizes the terminal analysis result', () => {
    expect(parseArtworkAnalysisStreamEvent({
      event: 'complete',
      data: JSON.stringify({
        type: 'result',
        artwork_id: 'artwork-1',
        artist_name: 'Hilma af Klint',
        artwork_name: 'The Swan',
        analysis: 'A symbolic abstract composition.',
        tags: ['abstract'],
        model_used: 'openai',
        analysis_status: 'analyzed',
      }),
    })).toEqual({
      type: 'complete',
      result: expect.objectContaining({
        artwork_id: 'artwork-1',
        artist_name: 'Hilma af Klint',
        artwork_name: 'The Swan',
        analysis_status: 'analyzed',
      }),
    });
  });

  it('rejects malformed and incomplete terminal events', () => {
    expect(parseArtworkAnalysisStreamEvent({ event: 'complete', data: '{}' })).toBeNull();
    expect(parseArtworkAnalysisStreamEvent({ event: 'chunk', data: 'not-json' })).toBeNull();
  });
});
