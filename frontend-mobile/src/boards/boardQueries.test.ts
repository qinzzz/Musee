import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { boardKeys, cacheBoard, uncacheBoard } from './boardQueries';

describe('board cache', () => {
  it('patches server-confirmed results without changing another account or board order', () => {
    const client = new QueryClient();
    const old = { id: 'b', name: 'Before', itemIds: ['one'] };
    client.setQueryData(boardKeys.list('u'), [{ id: 'a', name: 'First', itemIds: [] }, old]);
    client.setQueryData(boardKeys.list('other'), [old]);
    const updated = { ...old, name: 'After', itemIds: ['one', 'two'] };
    cacheBoard(client, 'u', updated);
    expect(client.getQueryData(boardKeys.list('u'))).toEqual([{ id: 'a', name: 'First', itemIds: [] }, updated]);
    expect(client.getQueryData(boardKeys.detail('u', 'b'))).toEqual(updated);
    expect(client.getQueryData(boardKeys.list('other'))).toEqual([old]);
    expect(client.getQueryState(boardKeys.list('u'))?.isInvalidated).toBe(true);
    client.clear();
  });
  it('deletes only board caches and preserves artwork library data', () => {
    const client = new QueryClient();
    client.setQueryData(boardKeys.list('u'), [{ id: 'b' }]);
    client.setQueryData(boardKeys.detail('u', 'b'), { id: 'b' });
    client.setQueryData(boardKeys.artworks('u', 'b'), ['a']);
    client.setQueryData(['artwork-library', 'u'], ['a']);
    uncacheBoard(client, 'u', 'b');
    expect(client.getQueryData(boardKeys.list('u'))).toEqual([]);
    expect(client.getQueryData(boardKeys.detail('u', 'b'))).toBeUndefined();
    expect(client.getQueryData(boardKeys.artworks('u', 'b'))).toBeUndefined();
    expect(client.getQueryData(['artwork-library', 'u'])).toEqual(['a']);
    client.clear();
  });
});
