import type { Board } from '@musee/client-core';
import type { QueryClient } from '@tanstack/react-query';

export const boardKeys = {
  all: (userId: string) => ['boards', userId] as const,
  list: (userId: string) => ['boards', userId, 'list'] as const,
  detail: (userId: string, id: string) => ['boards', userId, 'detail', id] as const,
  artworks: (userId: string, id: string) => ['boards', userId, 'artworks', id] as const,
};

export function cacheBoard(client: QueryClient, userId: string, board: Board) {
  client.setQueryData(boardKeys.detail(userId, board.id), board);
  client.setQueryData<Board[]>(boardKeys.list(userId), (current) => current
    ? current.some((item) => item.id === board.id)
      ? current.map((item) => item.id === board.id ? board : item)
      : [board, ...current] : undefined);
  void client.invalidateQueries({ queryKey: boardKeys.all(userId), refetchType: 'none' });
}
export function uncacheBoard(client: QueryClient, userId: string, id: string) {
  client.setQueryData<Board[]>(boardKeys.list(userId), (current) => current?.filter((board) => board.id !== id));
  client.removeQueries({ queryKey: boardKeys.detail(userId, id), exact: true });
  client.removeQueries({ queryKey: boardKeys.artworks(userId, id), exact: true });
}
