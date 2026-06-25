import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useArtworkDetailPager } from './useArtworkDetailPager';
import type { InterpretingItem } from '../../artwork/types';

function createItem(id: string): InterpretingItem {
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
    const interpretingItem: InterpretingItem = {
      ...items[0],
      allVisitItems: items,
    };
    const setArtworkDetailSelection = vi.fn();

    const { result } = renderHook(() => useArtworkDetailPager({
      activeTab: 'collect',
      collectTab: 'saved',
      artworkDetailContext: {
        parentLabel: 'All Artworks',
        basePath: '/saved',
      },
      interpretingItem,
      setArtworkDetailSelection,
    }));

    window.history.pushState({ view: 'artwork' }, '', '/saved');

    act(() => {
      result.current.navigateInterpretation('next');
    });

    expect(setArtworkDetailSelection).toHaveBeenCalledWith({
      artworkId: 'a2',
      navigationItemIds: ['a1', 'a2', 'a3'],
    });
    expect(replaceStateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        view: 'artwork',
        artworkId: 'a2',
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
      interpretingItem: createItem('solo'),
      setArtworkDetailSelection,
    }));

    act(() => {
      result.current.navigateInterpretation('next');
    });

    expect(setArtworkDetailSelection).not.toHaveBeenCalled();
    expect(replaceStateSpy).not.toHaveBeenCalled();
  });
});
