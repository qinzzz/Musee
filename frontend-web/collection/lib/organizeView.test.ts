import { describe, expect, it } from 'vitest';

import type { GalleryItem } from '../../types';
import {
  filterArtworksByCollectionSearch,
  getCollectionSearchPlaceholder,
  getSavedContextLabel,
  groupArtworksByMonth,
} from './organizeView';

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

describe('organizeView helpers', () => {
  it('filters artworks against collection search metadata', () => {
    const items = [
      createItem('one', { artworkName: 'Water Lilies' }),
      createItem('two', { artistName: 'Georgia Okeeffe' }),
    ];

    expect(filterArtworksByCollectionSearch(items, 'lilies').map((item) => item.id)).toEqual(['one']);
    expect(filterArtworksByCollectionSearch(items, 'okeeffe').map((item) => item.id)).toEqual(['two']);
  });

  it('groups artworks by month in reverse chronological order', () => {
    const june = createItem('june', { timestamp: new Date('2026-06-10T12:00:00Z').getTime() });
    const may = createItem('may', { timestamp: new Date('2026-05-10T12:00:00Z').getTime() });

    const groups = groupArtworksByMonth([may, june]);

    expect(groups[0]?.items[0]?.id).toBe('june');
    expect(groups[1]?.items[0]?.id).toBe('may');
  });

  it('derives search placeholders and saved labels from active view state', () => {
    expect(getCollectionSearchPlaceholder('saved', null, '')).toBe('Search artworks');
    expect(getCollectionSearchPlaceholder('boards', 'board-1', 'Favorites')).toBe('Search Favorites');
    expect(getCollectionSearchPlaceholder('museums', null, '')).toBe('Search museums');
    expect(getSavedContextLabel('not_for_me')).toBe('Not for Me');
  });
});
