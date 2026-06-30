import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { GalleryItem } from '../../types';
import { useCollectionViewModel } from './useCollectionViewModel';

function createItem(id: string, overrides: Partial<GalleryItem> = {}): GalleryItem {
  return {
    id,
    artworkId: id,
    url: `https://example.com/${id}.jpg`,
    artistName: 'Artist',
    artworkName: `Artwork ${id}`,
    description: 'Description',
    keywords: [],
    timestamp: 1,
    sessionCapturedAt: 1,
    conversation: [],
    vibe: {
      backgroundColor: '#ffffff',
      padding: 4,
      borderRadius: '12px',
      borderType: 'solid',
      accentColor: '#000000',
    },
    ...overrides,
  };
}

describe('useCollectionViewModel', () => {
  it('derives board detail items and placeholder from current collection state', () => {
    const items = [createItem('a1'), createItem('a2')];
    const boards = [{ id: 'board-1', name: 'Favorites', description: null, itemIds: ['a2'] }];

    const { result } = renderHook(() =>
      useCollectionViewModel({
        items,
        likedIds: new Set(['a1']),
        boards,
        artists: [],
        collectTab: 'boards',
        activeFilter: 'all',
        selectedBoard: 'board-1',
        normalizedCollectionSearch: '',
        artworksLoaded: true,
      }),
    );

    expect(result.current.boardDetailName).toBe('Favorites');
    expect(result.current.boardDetailItems.map((item) => item.id)).toEqual(['a2']);
    expect(result.current.collectionSearchPlaceholder).toBe('Search Favorites');
  });
});
