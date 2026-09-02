import { describe, expect, it } from 'vitest';

import {
  createCameraImageAsset,
  createLibraryImageAsset,
  MAX_ARTWORK_UPLOAD_SIZE_BYTES,
} from './nativeImageAsset';

describe('native image asset', () => {
  it('normalizes a compatible library image', () => {
    expect(createLibraryImageAsset({
      uri: 'file:///cache/artwork.jpg',
      fileName: 'IMG_1000.JPG',
      fileSize: 1_024,
      width: 1200,
      height: 900,
      mimeType: 'IMAGE/JPEG',
    })).toEqual({
      uri: 'file:///cache/artwork.jpg',
      fileName: 'IMG_1000.JPG',
      fileSize: 1_024,
      width: 1200,
      height: 900,
      mimeType: 'image/jpeg',
      source: 'library',
    });
  });

  it('rejects an oversized image before upload', () => {
    expect(() => createLibraryImageAsset({
      uri: 'file:///cache/large.jpg',
      fileName: 'large.jpg',
      fileSize: MAX_ARTWORK_UPLOAD_SIZE_BYTES + 1,
      width: 6000,
      height: 4000,
      mimeType: 'image/jpeg',
    })).toThrow('smaller than 10 MB');
  });

  it('rejects a format the backend cannot process', () => {
    expect(() => createLibraryImageAsset({
      uri: 'file:///cache/artwork.gif',
      fileName: 'artwork.gif',
      width: 600,
      height: 400,
      mimeType: 'image/gif',
    })).toThrow('JPEG, PNG, or WebP');
  });

  it('normalizes a camera capture for the existing upload pipeline', () => {
    const asset = createCameraImageAsset({
      uri: 'file:///cache/capture.jpg',
      fileSize: 2_048,
      width: 3024,
      height: 4032,
      format: 'jpg',
    });

    expect(asset).toMatchObject({
      uri: 'file:///cache/capture.jpg',
      fileSize: 2_048,
      width: 3024,
      height: 4032,
      mimeType: 'image/jpeg',
      source: 'camera',
    });
    expect(asset.fileName).toMatch(/^musee-\d+\.jpg$/);
  });
});
