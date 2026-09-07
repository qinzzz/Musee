import type { Board } from './boards';

export function filterBoardsBySearch(boards: Board[], query: string): Board[] {
  const normalized = query.trim().toLowerCase();
  return normalized ? boards.filter((board) => board.name.toLowerCase().includes(normalized)) : boards;
}

// Preserve membership order: inspect only the first four entries, then omit unavailable images.
export function getBoardCoverImages(itemIds: string[], items: Array<{ id: string; url?: string | null }>): string[] {
  return itemIds.slice(0, 4)
    .map((id) => items.find((item) => item.id === id)?.url)
    .filter((url): url is string => Boolean(url));
}
