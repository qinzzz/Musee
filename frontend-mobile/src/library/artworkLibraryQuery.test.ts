import { QueryClient, type InfiniteData } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import {
  artworkLibraryQueryKey,
  flattenArtworkLibraryPages,
  getNextArtworkPageParam,
  invalidateArtworkLibraryQuery,
  removeArtworkFromLibraryQuery,
  updateArtworkLibraryQuery,
} from './artworkLibraryQuery';
import type { MobileArtworkPage, MobileArtworkRecord } from './types';

function artwork(id: string): MobileArtworkRecord {
  return {
    id,
    photoUri: `${id}.jpg`,
    thumbnailUri: null,
    resolvedImageUri: `https://example.com/${id}.jpg`,
    resolvedThumbnailUri: `https://example.com/${id}.jpg`,
    cacheKey: `artwork:${id}`,
    thumbnailCacheKey: `artwork:${id}`,
    artistName: `Artist ${id}`,
    artworkName: `Artwork ${id}`,
    analysis: null,
    analysisStatus: 'pending',
    analysisError: null,
    date: null,
    medium: null,
    movement: null,
    periodBucket: null,
    tags: [],
    isDeleted: false,
    createdAt: null,
  };
}

function page(ids: string[], total: number, offset: number): MobileArtworkPage {
  return { items: ids.map(artwork), total, offset, limit: 30 };
}

function seed(queryClient: QueryClient, userId: string): void {
  const data: InfiniteData<MobileArtworkPage, number> = {
    pages: [page(['a', 'b'], 3, 0), page(['c'], 3, 2)],
    pageParams: [0, 2],
  };
  queryClient.setQueryData(artworkLibraryQueryKey(userId), data);
}

describe('artwork Library query helpers', () => {
  it('derives the next offset from the server page', () => {
    expect(getNextArtworkPageParam(page(['a', 'b'], 3, 0))).toBe(2);
    expect(getNextArtworkPageParam(page(['c'], 3, 2))).toBeUndefined();
  });

  it('flattens pages defensively without duplicate records', () => {
    const data = {
      pages: [page(['a', 'b'], 3, 0), page(['b', 'c'], 3, 2)],
      pageParams: [0, 2],
    };
    expect(flattenArtworkLibraryPages(data).map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });

  it('updates a record across loaded pages and supports explicit invalidation', () => {
    const queryClient = new QueryClient();
    seed(queryClient, 'user-1');
    updateArtworkLibraryQuery(queryClient, 'user-1', {
      ...artwork('b'),
      artworkName: 'Updated B',
    });
    const data = queryClient.getQueryData<InfiniteData<MobileArtworkPage, number>>(
      artworkLibraryQueryKey('user-1'),
    );
    expect(flattenArtworkLibraryPages(data)[1].artworkName).toBe('Updated B');
    expect(queryClient.getQueryState(artworkLibraryQueryKey('user-1'))?.isInvalidated).toBe(false);
    invalidateArtworkLibraryQuery(queryClient, 'user-1');
    expect(queryClient.getQueryState(artworkLibraryQueryKey('user-1'))?.isInvalidated).toBe(true);
  });

  it('removes a record and updates totals before server revalidation', () => {
    const queryClient = new QueryClient();
    seed(queryClient, 'user-1');
    removeArtworkFromLibraryQuery(queryClient, 'user-1', 'b');
    const data = queryClient.getQueryData<InfiniteData<MobileArtworkPage, number>>(
      artworkLibraryQueryKey('user-1'),
    );
    expect(flattenArtworkLibraryPages(data).map((item) => item.id)).toEqual(['a', 'c']);
    expect(data?.pages.every((loadedPage) => loadedPage.total === 2)).toBe(true);
  });
});
