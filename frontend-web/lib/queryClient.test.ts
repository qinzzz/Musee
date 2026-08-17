import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { queryKeys, transitionUserQueryCache } from './queryClient';

describe('transitionUserQueryCache', () => {
  it('removes guest-owned lists while preserving promoted session-event history', async () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.sessions('guest-1'), [{ id: 'session-1' }]);
    client.setQueryData(queryKeys.artworks('guest-1'), [{ id: 'art-1' }]);
    client.setQueryData(queryKeys.sessionEvents('session-1'), [{ id: 'event-1' }]);
    client.setQueryData(queryKeys.sessions('user-1'), [{ id: 'session-1' }]);

    await transitionUserQueryCache(client, 'guest-1', 'user-1');

    expect(client.getQueryData(queryKeys.sessions('guest-1'))).toBeUndefined();
    expect(client.getQueryData(queryKeys.artworks('guest-1'))).toBeUndefined();
    expect(client.getQueryData(queryKeys.sessionEvents('session-1'))).toEqual([{ id: 'event-1' }]);
    expect(client.getQueryState(queryKeys.sessions('user-1'))?.isInvalidated).toBe(true);
  });
});
