import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useArtworkDetailPager } from './useArtworkDetailPager';
import type { ArtworkDetailItem } from '../../artwork/types';

function createItem(id: string): ArtworkDetailItem {
  return {
    id,
    artworkId: id,
    url: `https://example.com/${id}.jpg`,
    keywords: [],
    vibe: {
      backgroundColor: '#fff',
      padding: 4,
      borderRadius: '12px',
      borderType: 'solid',
      accentColor: '#000',
    },
    timestamp: Date.now(),
    conversation: [],
    artworkName: id,
  };
}

describe('useArtworkDetailPager', () => {
  let replaceStateSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    replaceStateSpy = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {});
  });

  afterEach(() => {
    replaceStateSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('moves to the next artwork and replaces history state in artwork detail view', () => {
    const items = [createItem('a1'), createItem('a2'), createItem('a3')];
    const artworkDetailItem: ArtworkDetailItem = {
      ...items[0],
      navigationItems: items,
    };
    const setArtworkDetailSelection = vi.fn();

    const { result } = renderHook(() => useArtworkDetailPager({
      activeTab: 'collect',
      collectTab: 'saved',
      artworkDetailContext: {
        parentLabel: 'All Artworks',
        basePath: '/saved',
      },
      artworkDetailItem,
      setArtworkDetailSelection,
    }));

    window.history.pushState({ view: 'artwork' }, '', '/saved');

    act(() => {
      result.current.navigateArtworkDetail('next');
    });

    expect(setArtworkDetailSelection).toHaveBeenCalledWith({
      artworkClientId: 'a2',
      navigationItemClientIds: ['a1', 'a2', 'a3'],
    });
    expect(replaceStateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        view: 'artwork',
        artworkClientId: 'a2',
      }),
      '',
      '/saved',
    );
  });

  it('does nothing when there is no neighboring artwork set', () => {
    const setArtworkDetailSelection = vi.fn();

    const { result } = renderHook(() => useArtworkDetailPager({
      activeTab: 'collect',
      collectTab: 'saved',
      artworkDetailContext: null,
      artworkDetailItem: createItem('solo'),
      setArtworkDetailSelection,
    }));

    act(() => {
      result.current.navigateArtworkDetail('next');
    });

    expect(setArtworkDetailSelection).not.toHaveBeenCalled();
    expect(replaceStateSpy).not.toHaveBeenCalled();
  });
});
