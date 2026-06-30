import { describe, expect, it } from 'vitest';

import type { GalleryItem } from '../../types';
import type { ArtworkDetailSelection } from '../types';
import {
  buildArtworkListItem,
  getArtworkFailureMessage,
  isArtworkAnalyzing,
  isArtworkPendingDelete,
  mergeArtworkState,
  resolveArtworkDetailItem,
  splitArtworkListItem,
  updateArtworkInList,
} from './artworkState';

function createItem(overrides: Partial<GalleryItem> = {}): GalleryItem {
  return {
    id: 'art-1',
    artworkId: 'art-1',
    url: 'https://example.com/art.jpg',
    keywords: ['#line'],
    vibe: {
      backgroundColor: '#fff',
      padding: 4,
      borderRadius: '12px',
      borderType: 'solid',
      accentColor: '#000',
    },
    timestamp: 1,
    conversation: [],
    artistName: 'Artist',
    artworkName: 'Work',
    syncStatus: 'synced',
    ...overrides,
  };
}

describe('artworkState helpers', () => {
  it('splits and rebuilds artwork runtime state cleanly', () => {
    const item = createItem({
      analysisStatus: 'failed',
      analysisError: 'No result',
      streamingText: 'No result',
      isAnalyzing: false,
      deleteStatus: 'pending',
    });

    const { record, clientState } = splitArtworkListItem(item);
    const rebuilt = buildArtworkListItem(record, clientState);

    expect(record.artworkName).toBe('Work');
    expect(clientState.analysisStatus).toBe('failed');
    expect(clientState.deleteStatus).toBe('pending');
    expect(rebuilt).toEqual(item);
  });

  it('derives analyzing, delete, and failure state from client state helpers', () => {
    expect(isArtworkAnalyzing({ analysisStatus: 'pending' })).toBe(true);
    expect(isArtworkAnalyzing({ isAnalyzing: true })).toBe(true);
    expect(isArtworkPendingDelete({ deleteStatus: 'pending' })).toBe(true);
    expect(getArtworkFailureMessage({ analysisStatus: 'failed', analysisError: 'Oops' })).toBe('Oops');
    expect(getArtworkFailureMessage({ analysisStatus: 'analyzed', analysisError: 'Oops' })).toBeUndefined();
  });

  it('merges record and client-state patches without flattening the concerns together', () => {
    const merged = mergeArtworkState(createItem(), {
      record: { artworkName: 'Renamed' },
      clientState: { analysisStatus: 'failed', analysisError: 'No match' },
    });

    expect(merged.artworkName).toBe('Renamed');
    expect(merged.analysisStatus).toBe('failed');
    expect(merged.analysisError).toBe('No match');
    expect(merged.artistName).toBe('Artist');
  });

  it('updates only the matching artwork in a list', () => {
    const items = [
      createItem(),
      createItem({ id: 'art-2', artworkId: 'art-2', artworkName: 'Second' }),
    ];

    const updated = updateArtworkInList(items, 'art-2', {
      clientState: { deleteStatus: 'pending' },
    });

    expect(updated[0].deleteStatus).toBeUndefined();
    expect(updated[1].deleteStatus).toBe('pending');
  });

  it('resolves the artwork detail item from id-based selection', () => {
    const items = [
      createItem({ id: 'art-1', artworkId: 'art-1' }),
      createItem({ id: 'art-2', artworkId: 'art-2', artworkName: 'Second' }),
    ];
    const selection: ArtworkDetailSelection = {
      artworkId: 'art-2',
      navigationItemIds: ['art-1', 'art-2'],
      is_liked: true,
    };

    const result = resolveArtworkDetailItem(
      items,
      selection,
      (_sourceItem, allItems, navigationItemIds) =>
        navigationItemIds
          ? navigationItemIds.map((id) => allItems.find((item) => item.id === id)).filter(Boolean) as GalleryItem[]
          : allItems,
    );

    expect(result?.id).toBe('art-2');
    expect(result?.is_liked).toBe(true);
    expect(result?.navigationItems?.map((item) => item.id)).toEqual(['art-1', 'art-2']);
  });
});
