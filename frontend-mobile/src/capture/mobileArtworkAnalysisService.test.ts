import { describe, expect, it, vi } from 'vitest';

import type { MobileArtworkAnalysisTransport } from './mobileArtworkAnalysisTransport';
import { createMobileArtworkAnalysisService } from './mobileArtworkAnalysisService';
import type { PendingArtworkUpload } from './types';

const ARTWORK: PendingArtworkUpload = {
  id: 'artwork-1',
  photoUri: 'https://images.example.com/artwork.jpg',
  resolvedImageUri: 'https://images.example.com/artwork.jpg',
  cacheKey: 'artwork:artwork-1',
  analysisStatus: 'pending',
  artistName: 'Unknown Artist',
  artworkName: 'Untitled',
};

describe('mobile artwork analysis service', () => {
  it('keeps the uploaded image identity while applying the analysis result', async () => {
    const transport: MobileArtworkAnalysisTransport = {
      analyzeArtwork: vi.fn().mockImplementation(async (_id, onProgress) => {
        onProgress?.({ type: 'chunk', content: 'partial' });
        return {
          artwork_id: 'artwork-1',
          artist_name: 'Hilma af Klint',
          artwork_name: 'The Swan',
          analysis: 'A symbolic abstract composition.',
          analysis_status: 'analyzed',
          tags: ['abstract'],
          model_used: 'openai',
        };
      }),
    };
    const onChunk = vi.fn();
    const service = createMobileArtworkAnalysisService(transport);

    await expect(service.analyzeArtwork(ARTWORK, onChunk)).resolves.toEqual({
      ...ARTWORK,
      analysisStatus: 'analyzed',
      artistName: 'Hilma af Klint',
      artworkName: 'The Swan',
      analysis: 'A symbolic abstract composition.',
      date: undefined,
      medium: undefined,
      tags: ['abstract'],
    });
    expect(transport.analyzeArtwork).toHaveBeenCalledWith('artwork-1', expect.any(Function));
    expect(onChunk).toHaveBeenCalledWith('partial');
  });
});
