import { createBoardService, type BoardUpdates } from '@musee/client-core';
import { API_BASE_URL, fetchWithTimeout } from './core';

const boards = createBoardService({ fetchWithTimeout }, API_BASE_URL);

export const fetchCollections = boards.list;
export const createCollection = boards.create;
export const deleteCollection = boards.remove;
export function updateCollection(userId: string, collectionId: string, updates: BoardUpdates) {
  return boards.update(userId, collectionId, updates);
}
