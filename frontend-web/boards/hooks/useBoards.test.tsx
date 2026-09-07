import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, act, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBoards } from './useBoards';

const {
  mockFetchCollections,
  mockCreateCollection,
  mockUpdateCollection,
  mockDeleteCollection,
} = vi.hoisted(() => ({
  mockFetchCollections: vi.fn(),
  mockCreateCollection: vi.fn(),
  mockUpdateCollection: vi.fn(),
  mockDeleteCollection: vi.fn(),
}));

vi.mock('../../api/collections', () => ({
  fetchCollections: mockFetchCollections,
  createCollection: mockCreateCollection,
  updateCollection: mockUpdateCollection,
  deleteCollection: mockDeleteCollection,
}));

function createBoard(id: string, name: string, itemIds: string[] = []) {
  return { id, name, description: null, itemIds };
}

function renderBoards(showToast: (message: string, type?: 'info' | 'success') => void) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useBoards({ userId: 'user-1', showToast }), { wrapper });
}

describe('useBoards', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.clearAllMocks();
  });

  it('loads boards on mount', async () => {
    mockFetchCollections.mockResolvedValue([createBoard('b1', 'Favorites')]);
    const showToast = vi.fn();

    const { result } = renderBoards(showToast);

    await waitFor(() => {
      expect(result.current.boardsLoading).toBe(false);
      expect(result.current.boards).toEqual([createBoard('b1', 'Favorites')]);
    });
  });

  it('creates, renames, adds items to, and deletes boards', async () => {
    mockFetchCollections.mockResolvedValue([createBoard('b1', 'Favorites', ['a1'])]);
    mockCreateCollection.mockResolvedValue(createBoard('b2', 'New Board'));
    mockUpdateCollection
      .mockResolvedValueOnce(createBoard('b1', 'Favorites', ['a1', 'a2']))
      .mockResolvedValueOnce(createBoard('b1', 'Renamed Board', ['a1', 'a2']));
    mockDeleteCollection.mockResolvedValue(undefined);
    const showToast = vi.fn();

    const { result } = renderBoards(showToast);

    await waitFor(() => {
      expect(result.current.boards).toHaveLength(1);
    });

    await act(async () => {
      await result.current.addItemsToBoard('b1', ['a2']);
    });
    expect(mockUpdateCollection).toHaveBeenCalledWith('user-1', 'b1', { addArtworkIds: ['a2'] });
    await waitFor(() => {
      expect(result.current.boards[0]).toEqual(createBoard('b1', 'Favorites', ['a1', 'a2']));
    });

    await act(async () => {
      await result.current.renameBoard('b1', 'Renamed Board');
    });
    await waitFor(() => {
      expect(result.current.boards[0]).toEqual(createBoard('b1', 'Renamed Board', ['a1', 'a2']));
    });

    await act(async () => {
      await result.current.createBoard('New Board');
    });
    await waitFor(() => {
      expect(result.current.boards[0]).toEqual(createBoard('b2', 'New Board'));
    });

    await act(async () => {
      await result.current.deleteBoard('b1');
    });
    await waitFor(() => {
      expect(result.current.boards.some((board) => board.id === 'b1')).toBe(false);
    });
    expect(showToast).toHaveBeenCalledWith('Deleted board "Renamed Board"', 'success');
  });

  it('falls back to empty boards when load fails', async () => {
    mockFetchCollections.mockRejectedValue(new Error('load failed'));
    const showToast = vi.fn();

    const { result } = renderBoards(showToast);

    await waitFor(() => {
      expect(result.current.boardsLoading).toBe(false);
    });

    expect(result.current.boards).toEqual([]);
  });
});
