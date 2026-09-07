import { describe, expect, it } from 'vitest';
import { filterBoardsBySearch, getBoardCoverImages } from './boardPresentation';

describe('board presentation shared with web', () => {
  it('preserves member order and considers only the first four references', () => {
    expect(getBoardCoverImages(['missing', 'b', 'a', 'c', 'd'], [
      { id: 'a', url: 'A' }, { id: 'b', url: 'B' }, { id: 'c', url: 'C' }, { id: 'd', url: 'D' },
    ])).toEqual(['B', 'A', 'C']);
    expect(getBoardCoverImages(['missing'], [])).toEqual([]);
  });
  it('matches board names case-insensitively with trimmed search text', () => {
    const boards = [{ id: 'a', name: 'Favorite Dogs', itemIds: [] }, { id: 'b', name: 'Landscapes', itemIds: [] }];
    expect(filterBoardsBySearch(boards, ' DOG ')).toEqual([boards[0]]);
    expect(filterBoardsBySearch(boards, '  ')).toBe(boards);
    expect(filterBoardsBySearch(boards, 'museum')).toEqual([]);
  });
});
