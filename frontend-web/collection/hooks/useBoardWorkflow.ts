import { useState } from 'react';

import type { Board } from '../../boards/types';

type CreateBoardRequest = {
  itemIds?: string[];
  onCreated?: (board: Board) => void;
};

type Params = {
  onCreateBoard: (name: string, itemIds?: string[]) => Promise<Board>;
  onRenameBoard: (boardId: string, name: string) => Promise<Board>;
  onDeleteBoard: (boardId: string) => Promise<void>;
};

export function useBoardWorkflow({
  onCreateBoard,
  onRenameBoard,
  onDeleteBoard,
}: Params) {
  const [selectedBoard, setSelectedBoard] = useState<'liked' | string | null>(null);
  const [newBoardName, setNewBoardName] = useState('');
  const [isSubmittingBoard, setIsSubmittingBoard] = useState(false);
  const [createBoardRequest, setCreateBoardRequest] = useState<CreateBoardRequest | null>(null);
  const [renameBoardTarget, setRenameBoardTarget] = useState<Board | null>(null);
  const [deleteBoardTarget, setDeleteBoardTarget] = useState<Board | null>(null);

  const submitBoard = async () => {
    const trimmedName = newBoardName.trim();
    const pendingRequest = createBoardRequest;
    if (!trimmedName || isSubmittingBoard || !pendingRequest) return;

    try {
      setIsSubmittingBoard(true);
      const createdBoard = await onCreateBoard(trimmedName, pendingRequest.itemIds);
      pendingRequest.onCreated?.(createdBoard);
      setNewBoardName('');
      setCreateBoardRequest(null);
    } catch (error) {
      console.error('Failed to create board:', error);
    } finally {
      setIsSubmittingBoard(false);
    }
  };

  const openCreateBoardModal = (options?: CreateBoardRequest) => {
    setNewBoardName('');
    setCreateBoardRequest({
      itemIds: options?.itemIds,
      onCreated: options?.onCreated,
    });
  };

  const closeCreateBoardModal = () => {
    if (isSubmittingBoard) return;
    setCreateBoardRequest(null);
    setNewBoardName('');
  };

  const submitRenameBoard = async () => {
    const trimmedName = newBoardName.trim();
    if (!trimmedName || isSubmittingBoard || !renameBoardTarget) return;

    try {
      setIsSubmittingBoard(true);
      await onRenameBoard(renameBoardTarget.id, trimmedName);
      setRenameBoardTarget(null);
      setNewBoardName('');
    } catch (error) {
      console.error('Failed to rename board:', error);
    } finally {
      setIsSubmittingBoard(false);
    }
  };

  const openRenameBoardModal = (board: Board) => {
    setCreateBoardRequest(null);
    setRenameBoardTarget(board);
    setNewBoardName(board.name);
  };

  const closeRenameBoardModal = () => {
    if (isSubmittingBoard) return;
    setRenameBoardTarget(null);
    setNewBoardName('');
  };

  const handleDeleteBoard = async (board: Board) => {
    try {
      setIsSubmittingBoard(true);
      await onDeleteBoard(board.id);
      if (selectedBoard === board.id) {
        setSelectedBoard(null);
      }
      setDeleteBoardTarget(null);
    } catch (error) {
      console.error('Failed to delete board:', error);
    } finally {
      setIsSubmittingBoard(false);
    }
  };

  return {
    selectedBoard,
    setSelectedBoard,
    newBoardName,
    setNewBoardName,
    isSubmittingBoard,
    createBoardRequest,
    renameBoardTarget,
    deleteBoardTarget,
    setDeleteBoardTarget,
    submitBoard,
    openCreateBoardModal,
    closeCreateBoardModal,
    submitRenameBoard,
    openRenameBoardModal,
    closeRenameBoardModal,
    handleDeleteBoard,
  };
}
