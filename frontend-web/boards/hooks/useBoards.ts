import { useCallback, useEffect, useState } from 'react';
import {
  createCollection,
  deleteCollection,
  fetchCollections,
  updateCollection,
} from '../../api/collections';
import type { Board } from '../types';

type ToastType = 'info' | 'success';

type UseBoardsOptions = {
  userId: string;
  showToast: (message: string, type?: ToastType) => void;
};

export function useBoards({ userId, showToast }: UseBoardsOptions) {
  const [boards, setBoards] = useState<Board[]>([]);
  const [boardsLoading, setBoardsLoading] = useState(false);

  const refreshBoards = useCallback(async () => {
    setBoardsLoading(true);
    try {
      const nextBoards = await fetchCollections(userId);
      setBoards(nextBoards);
    } catch (error) {
      console.error('Failed to load collections:', error);
      setBoards([]);
    } finally {
      setBoardsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    let cancelled = false;

    setBoardsLoading(true);
    fetchCollections(userId)
      .then((nextBoards) => {
        if (!cancelled) {
          setBoards(nextBoards);
        }
      })
      .catch((error) => {
        console.error('Failed to load collections:', error);
        if (!cancelled) {
          setBoards([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setBoardsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const addItemsToBoard = useCallback(async (boardId: string, itemIds: string[]) => {
    const targetBoard = boards.find((board) => board.id === boardId);
    if (!targetBoard) return;

    const nextItemIds = Array.from(new Set([...targetBoard.itemIds, ...itemIds]));
    const updatedBoard = await updateCollection(boardId, { artworkIds: nextItemIds });
    setBoards((prev) => prev.map((board) => (board.id === boardId ? updatedBoard : board)));
    showToast(`Added ${itemIds.length} ${itemIds.length === 1 ? 'artwork' : 'artworks'} to ${updatedBoard.name}`, 'success');
  }, [boards, showToast]);

  const createBoard = useCallback(async (name: string, itemIds: string[] = []) => {
    const created = await createCollection(userId, name, itemIds);
    setBoards((prev) => [created, ...prev]);
    showToast(`Created board "${created.name}"`, 'success');
    return created;
  }, [showToast, userId]);

  const renameBoard = useCallback(async (boardId: string, name: string) => {
    const updated = await updateCollection(boardId, { name });
    setBoards((prev) => prev.map((board) => (board.id === boardId ? updated : board)));
    return updated;
  }, []);

  const deleteBoard = useCallback(async (boardId: string) => {
    const targetBoard = boards.find((board) => board.id === boardId);
    await deleteCollection(boardId);
    setBoards((prev) => prev.filter((board) => board.id !== boardId));
    showToast(`Deleted board "${targetBoard?.name || 'Untitled'}"`, 'success');
  }, [boards, showToast]);

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
