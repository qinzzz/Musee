import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GalleryItem } from '../../types';
import { usePreparedSessionStaging } from './usePreparedSessionStaging';

function createGalleryItem(overrides: Partial<GalleryItem> = {}): GalleryItem {
  return {
    id: 'item-1',
    artworkId: 'artwork-1',
    url: 'blob://artwork',
    keywords: [],
    timestamp: 1,
    conversation: [],
    vibe: {
      backgroundColor: '#fff',
      padding: 4,
      borderRadius: '12px',
      borderType: 'solid',
      accentColor: '#000',
    },
    ...overrides,
  };
}

describe('usePreparedSessionStaging', () => {
  it('includes analyzing artworks for visible disabled picker states', () => {
    const analyzing = createGalleryItem({ isAnalyzing: true });
    const deleted = createGalleryItem({ id: 'deleted', isDeletedPlaceholder: true });

    const { result } = renderHook(() => usePreparedSessionStaging({
      items: [analyzing, deleted],
      showToast: vi.fn(),
    }));

    expect(result.current.availableLibraryArtworks).toEqual([analyzing]);
  });
});
