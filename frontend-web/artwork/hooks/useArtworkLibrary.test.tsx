import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useArtworkLibrary } from './useArtworkLibrary';
import type { GalleryItem } from '../../types';

const {
  mockFetchUserArtworks,
  mockResolveImageUrl,
  mockUpdateArtworkClassification,
  mockReadArtworkBootstrapCache,
  mockWriteArtworkBootstrapCache,
} = vi.hoisted(() => ({
  mockFetchUserArtworks: vi.fn(),
  mockResolveImageUrl: vi.fn(),
  mockUpdateArtworkClassification: vi.fn(),
  mockReadArtworkBootstrapCache: vi.fn(),
  mockWriteArtworkBootstrapCache: vi.fn(),
}));

vi.mock('../../api/artworks', () => ({
  fetchUserArtworks: mockFetchUserArtworks,
  resolveImageUrl: mockResolveImageUrl,
  updateArtworkClassification: mockUpdateArtworkClassification,
}));

vi.mock('../../lib/bootstrapCache', () => ({
  readArtworkBootstrapCache: mockReadArtworkBootstrapCache,
  writeArtworkBootstrapCache: mockWriteArtworkBootstrapCache,
}));

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createGalleryItem(overrides: Partial<GalleryItem> = {}): GalleryItem {
  return {
    id: 'item-1',
    artworkId: 'artwork-1',
    url: 'https://example.com/1.jpg',
    keywords: ['#nature'],
    vibe: {
      backgroundColor: '#fff',
      padding: 4,
      borderRadius: '12px',
      borderType: 'solid',
      accentColor: '#000',
    },
    timestamp: Date.now(),
    conversation: [],
    artistName: 'Artist',
    artworkName: 'Title',
    classification: 'unsorted',
    syncStatus: 'synced',
    ...overrides,
  };
}

function createCacheItem() {
  return [{
    id: 'cached-1',
    artworkId: 'cached-1',
    url: 'https://example.com/cached.jpg',
    artistName: 'Cached Artist',
    artworkName: 'Cached Work',
    description: 'Cached description',
    keywords: ['#cached'],
    date: '1900',
    medium: 'Oil',
    timestamp: 1710000000000,
    sessionCapturedAt: 1710000000000,
    sessionLinks: [{ sessionId: 'visit-1' }],
    location: 'SF',
    photoTime: 'Jun 1, 2026',
    movement: undefined,
    periodBucket: undefined,
    referenceUrls: [],
    insights: [],
    artistEntityId: 'artist-1',
    classification: 'unsorted' as const,
    analysisStatus: 'analyzed' as const,
    analysisError: undefined,
  }];
}

function createServerRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'server-1',
    photo_uri: 'https://example.com/server.jpg',
    artist_name: 'Server Artist',
    artwork_name: 'Server Work',
    analysis: 'Date: 1901\nMedium: Oil on canvas\nAnalysis: Server description',
    artwork_tags: [{ name: 'Nature' }],
    date: '1901',
    medium: 'Oil on canvas',
    photo_time: '2026-06-01T00:00:00Z',
    created_at: '2026-06-01T00:00:00Z',
    session_links: [{ session_id: 'visit-1', source: 'upload' }],
    location: { city: 'San Francisco' },
    movement: 'Impressionism',
    period_bucket: '1900s',
    reference_urls: [],
    insights: [],
    artist_entity_id: 'artist-1',
    classification: 'love',
    analysis_status: 'analyzed',
    analysis_error: null,
    ...overrides,
  };
}

describe('useArtworkLibrary', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockResolveImageUrl.mockImplementation((value: string) => value);
    mockReadArtworkBootstrapCache.mockReturnValue(null);
    mockWriteArtworkBootstrapCache.mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.clearAllMocks();
  });

  it('hydrates cache first and preserves pending local items when server data loads', async () => {
    const deferred = createDeferred<{ items: ReturnType<typeof createServerRecord>[] }>();
    mockReadArtworkBootstrapCache.mockReturnValue(createCacheItem());
    mockFetchUserArtworks.mockReturnValue(deferred.promise);

    const tagUpdater = vi.fn();
    const { result } = renderHook(() => useArtworkLibrary({
      userId: 'user-1',
      showToast: vi.fn(),
      onTagPositionsLoaded: tagUpdater,
    }));

    expect(result.current.items[0].artistName).toBe('Cached Artist');

    act(() => {
      result.current.setItems((prev) => [
        ...prev,
        createGalleryItem({
          id: 'pending-1',
          artworkId: 'pending-1',
          syncStatus: 'pending',
          artistName: 'Pending',
        }),
      ]);
    });

    deferred.resolve({ items: [createServerRecord()] });

    await waitFor(() => {
      expect(result.current.artworksLoaded).toBe(true);
      expect(result.current.items.some((item) => item.id === 'pending-1')).toBe(true);
      expect(result.current.items.some((item) => item.id === 'server-1')).toBe(true);
    });

    expect(tagUpdater).toHaveBeenCalled();
    expect(mockWriteArtworkBootstrapCache).toHaveBeenCalled();
  });

  it('builds and restores interpreting items from history', async () => {
    mockFetchUserArtworks.mockResolvedValue({
      items: [
        createServerRecord({ id: 'server-1' }),
        createServerRecord({ id: 'server-2', session_links: [{ session_id: 'visit-1', source: 'camera' }] }),
      ],
    });

    const onArtworkDetailContextChange = vi.fn();
    const { result } = renderHook(() => useArtworkLibrary({
      userId: 'user-1',
      showToast: vi.fn(),
      onArtworkDetailContextChange,
    }));

    await waitFor(() => {
      expect(result.current.items).toHaveLength(2);
    });

    const selection = result.current.buildArtworkDetailSelection(result.current.items[0], result.current.items);
    expect(selection).toEqual({
      artworkId: 'server-1',
      navigationItemIds: ['server-1', 'server-2'],
    });

    act(() => {
      result.current.restoreArtworkFromHistory('server-1', {
        parentLabel: 'All Artworks',
        basePath: '/saved',
      });
    });

    expect(onArtworkDetailContextChange).toHaveBeenCalledWith({
      parentLabel: 'All Artworks',
      basePath: '/saved',
    });
    expect(result.current.interpretingItem?.id).toBe('server-1');
    expect(result.current.interpretingItem?.navigationItems).toHaveLength(2);
  });

  it('clears interpretation and calls missing callbacks when restoring a missing artwork', async () => {
    mockFetchUserArtworks.mockResolvedValue({ items: [] });

    const onMissingArtworkFromHistory = vi.fn();
    const onArtworkDetailContextChange = vi.fn();
    const { result } = renderHook(() => useArtworkLibrary({
      userId: 'user-1',
      showToast: vi.fn(),
      onMissingArtworkFromHistory,
      onArtworkDetailContextChange,
    }));

    await waitFor(() => {
      expect(result.current.artworksLoaded).toBe(true);
    });

    act(() => {
      result.current.restoreArtworkFromHistory('missing', {
        parentLabel: 'All Artworks',
        basePath: '/saved',
      });
    });

    expect(result.current.interpretingItem).toBeNull();
    expect(onArtworkDetailContextChange).toHaveBeenCalledWith(null);
    expect(onMissingArtworkFromHistory).toHaveBeenCalled();
  });

  it('rolls back classification changes when the API update fails', async () => {
    mockFetchUserArtworks.mockResolvedValue({ items: [createServerRecord()] });
    mockUpdateArtworkClassification.mockRejectedValue(new Error('nope'));

    const showToast = vi.fn();
    const { result } = renderHook(() => useArtworkLibrary({
      userId: 'user-1',
      showToast,
    }));

    await waitFor(() => {
      expect(result.current.items).toHaveLength(1);
    });

    await expect(result.current.handleUpdateClassification('server-1', 'respect')).rejects.toThrow('nope');

    expect(result.current.items[0].classification).toBe('love');
    expect(showToast).toHaveBeenCalledWith('Could not update artwork classification', 'info');
  });

  it('updates metadata in both the gallery list and interpreting item', async () => {
    mockFetchUserArtworks.mockResolvedValue({ items: [createServerRecord()] });

    const { result } = renderHook(() => useArtworkLibrary({
      userId: 'user-1',
      showToast: vi.fn(),
    }));

    await waitFor(() => {
      expect(result.current.items).toHaveLength(1);
    });

    act(() => {
      result.current.setArtworkDetailSelection(result.current.buildArtworkDetailSelection(result.current.items[0]));
      result.current.updateItemMetadata('server-1', {
        artistName: 'Updated Artist',
        artworkName: 'Updated Work',
        date: '1910',
      });
    });

    expect(result.current.items[0]).toMatchObject({
      artistName: 'Updated Artist',
      artworkName: 'Updated Work',
      date: '1910',
    });
    expect(result.current.interpretingItem).toMatchObject({
      artistName: 'Updated Artist',
      artworkName: 'Updated Work',
      date: '1910',
    });
  });

  it('derives the latest navigation cohort for the open artwork from live items state', async () => {
    mockFetchUserArtworks.mockResolvedValue({
      items: [
        createServerRecord({ id: 'server-1' }),
        createServerRecord({ id: 'server-2', artwork_name: 'Second Work' }),
      ],
    });

    const { result } = renderHook(() => useArtworkLibrary({
      userId: 'user-1',
      showToast: vi.fn(),
    }));

    await waitFor(() => {
      expect(result.current.items).toHaveLength(2);
    });

    act(() => {
      result.current.setArtworkDetailSelection(
        result.current.buildArtworkDetailSelection(result.current.items[0], result.current.items),
      );
    });

    expect(result.current.interpretingItem?.navigationItems?.[1].artworkName).toBe('Second Work');

    act(() => {
      result.current.setItems((prev) => prev.map((item) => (
        item.id === 'server-2' ? { ...item, artworkName: 'Updated Second Work' } : item
      )));
    });

    expect(result.current.interpretingItem?.navigationItems?.[1].artworkName).toBe('Updated Second Work');
  });
});
