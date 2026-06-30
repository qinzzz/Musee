import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useBoardWorkflow } from './useBoardWorkflow';

describe('useBoardWorkflow', () => {
  it('creates a board and closes the create modal state', async () => {
    const onCreateBoard = vi.fn().mockResolvedValue({ id: 'board-1', name: 'Favorites', itemIds: [] });
    const onRenameBoard = vi.fn();
    const onDeleteBoard = vi.fn();
    const onCreated = vi.fn();

    const { result } = renderHook(() =>
      useBoardWorkflow({
        onCreateBoard,
        onRenameBoard,
        onDeleteBoard,
      }),
    );

    act(() => {
      result.current.openCreateBoardModal({ itemIds: ['a1'], onCreated });
      result.current.setNewBoardName('Favorites');
    });

    await act(async () => {
      await result.current.submitBoard();
    });

    expect(onCreateBoard).toHaveBeenCalledWith('Favorites', ['a1']);
    expect(onCreated).toHaveBeenCalledWith({ id: 'board-1', name: 'Favorites', itemIds: [] });
    expect(result.current.createBoardRequest).toBeNull();
    expect(result.current.newBoardName).toBe('');
  });
});
