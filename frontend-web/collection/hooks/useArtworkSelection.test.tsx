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
  it('supports an explicit empty selection mode for touch layouts', () => {
    const items = [createItem('a1')];
    const { result } = renderHook(() =>
      useArtworkSelection({
        collectTab: 'saved',
        savedLayout: 'grid',
        searchedSavedItems: items,
        items,
        onAddItemsToBoard: vi.fn().mockResolvedValue(undefined),
        onDeleteArtworks: vi.fn().mockResolvedValue(undefined),
      }),
    );

    act(() => result.current.enterArtworkSelectionMode());
    expect(result.current.isArtworkSelectionMode).toBe(true);
    expect(result.current.selectedArtworkIds).toEqual([]);

    act(() => result.current.clearArtworkSelection());
    expect(result.current.isArtworkSelectionMode).toBe(false);
  });

  it('clears selection after adding selected artworks to a board', async () => {
    const onAddItemsToBoard = vi.fn().mockResolvedValue(undefined);
    const onDeleteArtworks = vi.fn().mockResolvedValue(undefined);
    const items = [createItem('a1'), createItem('a2')];

    const { result } = renderHook(() =>
      useArtworkSelection({
        collectTab: 'saved',
        savedLayout: 'grid',
        searchedSavedItems: items,
        items,
        onAddItemsToBoard,
        onDeleteArtworks,
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

  it('keeps selection while delegating bulk delete confirmation', async () => {
    const onAddItemsToBoard = vi.fn().mockResolvedValue(undefined);
    const onDeleteArtworks = vi.fn().mockResolvedValue(undefined);
    const items = [createItem('a1'), createItem('a2')];

    const { result } = renderHook(() =>
      useArtworkSelection({
        collectTab: 'saved',
        savedLayout: 'grid',
        searchedSavedItems: items,
        items,
        onAddItemsToBoard,
        onDeleteArtworks,
      }),
    );

    act(() => {
      result.current.toggleArtworkSelection('a1');
      result.current.toggleArtworkSelection('a2');
    });

    await act(async () => {
      await result.current.handleDeleteSelection();
    });

    expect(onDeleteArtworks).toHaveBeenCalledWith(['a1', 'a2']);
    expect(result.current.selectedArtworkIds).toEqual(['a1', 'a2']);
    expect(result.current.isDeletingSelection).toBe(false);
  });
});
