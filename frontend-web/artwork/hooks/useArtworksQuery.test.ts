import { describe, expect, it } from 'vitest';
import {
  ARTWORKS_STALE_TIME_MS,
  shouldRefreshArtworks,
} from './useArtworksQuery';

describe('shouldRefreshArtworks', () => {
  it('refreshes an uninitialized query', () => {
    expect(shouldRefreshArtworks(0, 1)).toBe(true);
  });

  it('keeps recent artwork data and refreshes once it becomes stale', () => {
    const updatedAt = 1_000;

    expect(shouldRefreshArtworks(updatedAt, updatedAt + ARTWORKS_STALE_TIME_MS - 1)).toBe(false);
    expect(shouldRefreshArtworks(updatedAt, updatedAt + ARTWORKS_STALE_TIME_MS)).toBe(true);
  });
});
