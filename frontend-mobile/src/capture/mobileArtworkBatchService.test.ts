import { describe, expect, it, vi } from 'vitest';

import type { MobileArtworkAnalysisService } from './mobileArtworkAnalysisService';
import { createMobileArtworkBatchService } from './mobileArtworkBatchService';
import type { MobileArtworkUploadService } from './mobileArtworkUploadService';
import type { AnalyzedArtwork, NativeImageAsset, PendingArtworkUpload } from './types';

const ASSET: NativeImageAsset = {
  fileName: 'one.jpg',
  height: 100,
  mimeType: 'image/jpeg',
  source: 'library',
  uri: 'file:///one.jpg',
  width: 100,
};

const UPLOADED: PendingArtworkUpload = {
  analysisStatus: 'pending',
  artistName: 'Unknown Artist',
  artworkName: 'Untitled',
  cacheKey: 'artwork:one',
  id: 'one',
  photoUri: 'one.jpg',
  resolvedImageUri: 'https://example.com/one.jpg',
  resolvedThumbnailUri: 'https://example.com/one.jpg',
  thumbnailCacheKey: 'artwork:one',
  thumbnailUri: null,
};

const ANALYZED: AnalyzedArtwork = {
  ...UPLOADED,
  analysis: 'Analysis',
  analysisStatus: 'analyzed',
  artistName: 'Artist',
  artworkName: 'Artwork',
  tags: [],
};

describe('mobile artwork batch service', () => {
  it('adapts native upload and analysis services to the shared batch lifecycle', async () => {
    const uploadService: MobileArtworkUploadService = {
      uploadArtwork: vi.fn().mockResolvedValue(UPLOADED),
    };
    const analysisService: MobileArtworkAnalysisService = {
      analyzeArtwork: vi.fn().mockResolvedValue(ANALYZED),
    };
    const service = createMobileArtworkBatchService({
      analysisService,
      uploadService,
      createId: () => 'batch-one',
    });

    const result = await service.process(service.createEntries([ASSET]), 'user-one');

    expect(uploadService.uploadArtwork).toHaveBeenCalledWith(ASSET, 'user-one');
    expect(analysisService.analyzeArtwork).toHaveBeenCalledWith(UPLOADED);
    expect(result[0]).toMatchObject({ id: 'batch-one', result: ANALYZED, status: 'complete' });
  });
});
