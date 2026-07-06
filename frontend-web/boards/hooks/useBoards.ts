import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createCollection,
  deleteCollection,
  fetchCollections,
  updateCollection,
} from '../../api/collections';
import { queryKeys } from '../../lib/queryClient';
import type { Board } from '../types';

type ToastType = 'info' | 'success';

type UseBoardsOptions = {
  userId: string;
  showToast: (message: string, type?: ToastType) => void;
};

// Boards are backend-owned; the query cache is the only client copy (no
// durable local persistence). Mutations confirm against the server first,
// then patch the cached list in place.
export function useBoards({ userId, showToast }: UseBoardsOptions) {
  const queryClient = useQueryClient();
  const boardsKey = queryKeys.boards(userId);

  const query = useQuery({
    queryKey: boardsKey,
    queryFn: () => fetchCollections(userId),
  });

  const boards = query.data ?? [];
  const boardsLoading = query.isFetching;

  const setBoards = useCallback((updater: (prev: Board[]) => Board[]) => {
    queryClient.setQueryData<Board[]>(queryKeys.boards(userId), (prev) => updater(prev ?? []));
  }, [queryClient, userId]);

  const refreshBoards = useCallback(async () => {
    await queryClient.refetchQueries({ queryKey: queryKeys.boards(userId) });
  }, [queryClient, userId]);

  const addItemsToBoard = useCallback(async (boardId: string, itemIds: string[]) => {
    const targetBoard = boards.find((board) => board.id === boardId);
    if (!targetBoard) return;

    const nextItemIds = Array.from(new Set([...targetBoard.itemIds, ...itemIds]));
    const updatedBoard = await updateCollection(userId, boardId, { artworkIds: nextItemIds });
    setBoards((prev) => prev.map((board) => (board.id === boardId ? updatedBoard : board)));
    showToast(`Added ${itemIds.length} ${itemIds.length === 1 ? 'artwork' : 'artworks'} to ${updatedBoard.name}`, 'success');
  }, [boards, setBoards, showToast, userId]);

  const createBoard = useCallback(async (name: string, itemIds: string[] = []) => {
    const created = await createCollection(userId, name, itemIds);
    setBoards((prev) => [created, ...prev]);
    showToast(`Created board "${created.name}"`, 'success');
    return created;
  }, [setBoards, showToast, userId]);

  const renameBoard = useCallback(async (boardId: string, name: string) => {
    const updated = await updateCollection(userId, boardId, { name });
    setBoards((prev) => prev.map((board) => (board.id === boardId ? updated : board)));
    return updated;
  }, [setBoards, userId]);

  const deleteBoard = useCallback(async (boardId: string) => {
    const targetBoard = boards.find((board) => board.id === boardId);
    await deleteCollection(userId, boardId);
    setBoards((prev) => prev.filter((board) => board.id !== boardId));
    showToast(`Deleted board "${targetBoard?.name || 'Untitled'}"`, 'success');
  }, [boards, setBoards, showToast, userId]);

  return {
    boards,
    boardsLoading,
    refreshBoards,
    addItemsToBoard,
    createBoard,
    renameBoard,
    deleteBoard,
  };
}
