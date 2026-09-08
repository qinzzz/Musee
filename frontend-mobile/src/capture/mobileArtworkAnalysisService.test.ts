import { describe, expect, it, vi } from 'vitest';

import type { MobileArtworkAnalysisTransport } from './mobileArtworkAnalysisTransport';
import { createMobileArtworkAnalysisService } from './mobileArtworkAnalysisService';
import type { PendingArtworkUpload } from './types';

const ARTWORK: PendingArtworkUpload = {
  id: 'artwork-1',
  photoUri: 'https://images.example.com/artwork.jpg',
  resolvedImageUri: 'https://images.example.com/artwork.jpg',
  cacheKey: 'artwork:artwork-1',
  thumbnailUri: null,
  resolvedThumbnailUri: 'https://images.example.com/artwork.jpg',
  thumbnailCacheKey: 'artwork-thumbnail:artwork-1',
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


it('retains a label on failure for retry, then omits it from completed artwork state', async () => {
  const labelAsset = { uri: 'file:///label.jpg', fileName: 'label.jpg', mimeType: 'image/jpeg', width: 100, height: 100, source: 'camera' as const };
  const pending = { ...ARTWORK, labelAsset };
  const transport = { analyzeArtwork: vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({
    artist_name: 'Artist', artwork_name: 'Title', analysis: 'Label evidence', tags: [],
  }) };
  const service = createMobileArtworkAnalysisService(transport);
  await expect(service.analyzeArtwork(pending)).rejects.toThrow('offline');
  expect(pending.labelAsset).toBe(labelAsset);
  const result = await service.analyzeArtwork(pending);
  expect(result).not.toHaveProperty('labelAsset');
  expect(result.photoUri).toBe(ARTWORK.photoUri);
  expect(transport.analyzeArtwork).toHaveBeenLastCalledWith(ARTWORK.id, expect.any(Function), labelAsset);
});
