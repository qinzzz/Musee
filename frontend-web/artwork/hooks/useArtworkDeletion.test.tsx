import { act, renderHook } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GalleryItem } from '../../types';
import { queryKeys } from '../../lib/queryClient';
import { useArtworkDeletion } from './useArtworkDeletion';

const { mockDeleteArtwork, mockBatchDeleteArtworks } = vi.hoisted(() => ({
  mockDeleteArtwork: vi.fn(),
  mockBatchDeleteArtworks: vi.fn(),
}));

vi.mock('../../api/artworks', () => ({
  deleteArtwork: mockDeleteArtwork,
  batchDeleteArtworks: mockBatchDeleteArtworks,
}));

function createItem(overrides: Partial<GalleryItem> = {}): GalleryItem {
  return {
    id: 'item-1',
    artworkId: 'artwork-1',
    url: 'https://example.com/art.jpg',
    keywords: [],
    vibe: {
      backgroundColor: '#fff',
      padding: 4,
      borderRadius: '12px',
      borderType: 'solid',
      accentColor: '#000',
    },
    timestamp: 1,
    conversation: [],
    ...overrides,
  };
}

function createHarness(items = [createItem()]) {
  const queryClient = new QueryClient();
  const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
  const options: Parameters<typeof useArtworkDeletion>[0] = {
    userId: 'user-1',
    items,
    queryClient,
    patchArtwork: vi.fn(),
    removeArtworkLocally: vi.fn(),
    clearArtworkDetailSelection: vi.fn(),
    refreshArtworks: vi.fn(),
    refreshProfileDerivedData: vi.fn(),
    requestConfirmation: vi.fn(),
    dismissConfirmation: vi.fn(),
    showToast: vi.fn(),
  };
  const hook = renderHook(() => useArtworkDeletion(options));
  return { ...hook, options, invalidateQueries };
}

describe('useArtworkDeletion', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;
  let consoleLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockDeleteArtwork.mockResolvedValue({ message: 'deleted' });
    mockBatchDeleteArtworks.mockResolvedValue({ message: 'deleted', deleted_count: 2 });
  });

  afterEach(() => {
    consoleError.mockRestore();
    consoleLog.mockRestore();
    vi.clearAllMocks();
  });

  it('requests single and batch confirmations without opening an empty batch', () => {
    const { result, options } = createHarness();

    act(() => {
      result.current.requestDeleteItem('item-1');
      result.current.requestDeleteItems(['item-1', 'item-2']);
      result.current.requestDeleteItems([]);
    });

    expect(options.requestConfirmation).toHaveBeenNthCalledWith(1, { type: 'item', id: 'item-1' });
    expect(options.requestConfirmation).toHaveBeenNthCalledWith(2, {
      type: 'items',
      ids: ['item-1', 'item-2'],
      count: 2,
    });
    expect(options.requestConfirmation).toHaveBeenCalledTimes(2);
  });

  it('optimistically marks and removes one artwork, then refreshes dependent data', async () => {
    const { result, options, invalidateQueries } = createHarness();

    await act(async () => {
      await result.current.confirmDeleteItem('item-1');
    });

    expect(options.dismissConfirmation).toHaveBeenCalledTimes(1);
    expect(options.patchArtwork).toHaveBeenCalledWith('item-1', {
      clientState: { deleteStatus: 'pending' },
    });
    expect(options.clearArtworkDetailSelection).toHaveBeenCalledWith('item-1');
    expect(mockDeleteArtwork).toHaveBeenCalledWith('artwork-1', 'user-1');
    expect(options.removeArtworkLocally).toHaveBeenCalledWith('item-1');
    expect(options.refreshArtworks).toHaveBeenCalledTimes(1);
    expect(options.refreshProfileDerivedData).toHaveBeenCalledTimes(1);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.sessionEventsRoot() });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.artists('user-1') });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.accountUsage('user-1') });
    expect(options.showToast).toHaveBeenCalledWith('Removed from collection', 'success');
  });

  it('uses the batch endpoint and removes every resolved item', async () => {
    const secondItem = createItem({ id: 'item-2', artworkId: 'artwork-2' });
    const { result, options } = createHarness([createItem(), secondItem]);

    await act(async () => {
      await result.current.confirmDeleteItems(['item-1', 'item-2']);
    });

    expect(mockBatchDeleteArtworks).toHaveBeenCalledWith(['artwork-1', 'artwork-2'], 'user-1');
    expect(mockDeleteArtwork).not.toHaveBeenCalled();
    expect(options.removeArtworkLocally).toHaveBeenCalledWith('item-1');
    expect(options.removeArtworkLocally).toHaveBeenCalledWith('item-2');
    expect(options.showToast).toHaveBeenCalledWith('Removed 2 artworks from collection', 'success');
  });

  it('rolls back pending state and preserves the rejection when deletion fails', async () => {
    const error = new Error('offline');
    mockDeleteArtwork.mockRejectedValue(error);
    const { result, options } = createHarness();

    await act(async () => {
      await expect(result.current.confirmDeleteItem('item-1')).rejects.toBe(error);
    });

    expect(options.patchArtwork).toHaveBeenNthCalledWith(1, 'item-1', {
      clientState: { deleteStatus: 'pending' },
    });
    expect(options.patchArtwork).toHaveBeenNthCalledWith(2, 'item-1', {
      clientState: { deleteStatus: undefined },
    });
    expect(options.removeArtworkLocally).not.toHaveBeenCalled();
    expect(options.showToast).toHaveBeenCalledWith('Could not remove artwork', 'info');
  });
});
