import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { GalleryItem } from '../../types';
import { useArtworkSelection } from './useArtworkSelection';

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

describe('useArtworkSelection', () => {
  it('clears selection after adding selected artworks to a board', async () => {
    const onAddItemsToBoard = vi.fn().mockResolvedValue(undefined);
    const items = [createItem('a1'), createItem('a2')];

    const { result } = renderHook(() =>
      useArtworkSelection({
        collectTab: 'saved',
        savedLayout: 'grid',
        searchedSavedItems: items,
        items,
        onAddItemsToBoard,
      }),
    );

    act(() => {
      result.current.toggleArtworkSelection('a1');
      result.current.toggleArtworkSelection('a2');
    });

    await act(async () => {
      await result.current.handleAddSelectionToBoard('board-1');
    });

    expect(onAddItemsToBoard).toHaveBeenCalledWith('board-1', ['a1', 'a2']);
    expect(result.current.selectedArtworkIds).toEqual([]);
    expect(result.current.isApplyingBoard).toBe(false);
  });
});
