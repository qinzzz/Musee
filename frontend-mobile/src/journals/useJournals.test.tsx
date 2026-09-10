// @vitest-environment jsdom
import { useEffect, type PropsWithChildren } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('../api/runtime', () => ({ mobileJournalService: mocks }));
vi.mock('expo-router', () => ({ useFocusEffect: (callback: () => void) => useEffect(callback, [callback]) }));
import { useJournals } from './useJournals';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

it('keeps loaded reflections on refresh failure and isolates account changes', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const entry = { id: 'j', local_date: '2026-09-08', reflection: 'Your memory.' };
  mocks.list.mockResolvedValue([entry]);
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const hook = renderHook(({ userId }) => useJournals(userId), { initialProps: { userId: 'a' }, wrapper });
  await waitFor(() => expect(hook.result.current.data).toEqual([entry]));
  await waitFor(() => expect(hook.result.current.isFetching).toBe(false));
  mocks.list.mockRejectedValue(new Error('offline'));
  await act(async () => { await hook.result.current.refetch(); });
  await waitFor(() => expect(hook.result.current.isError).toBe(true));
  expect(hook.result.current.data).toEqual([entry]);
  mocks.list.mockResolvedValue([]);
  hook.rerender({ userId: 'b' });
  expect(hook.result.current.data).toBeUndefined();
  await waitFor(() => expect(hook.result.current.data).toEqual([]));
  expect(mocks.list).toHaveBeenLastCalledWith('b');
  hook.unmount();
  client.clear();
});
