// @vitest-environment jsdom
import type { PropsWithChildren } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
vi.hoisted(() => { vi.stubGlobal('__DEV__', false); });
const mocks = vi.hoisted(() => ({ fetchPage: vi.fn() }));
vi.mock('../api/runtime', () => ({ MOBILE_API_BASE_URL: '/api', mobileArtworkLibraryService: mocks }));
import { useArtworkPicker } from './useArtworkPicker';
import { artworkLibraryQueryKey } from './artworkLibraryQuery';
afterEach(() => { cleanup(); vi.resetAllMocks(); });

it('shares Library pages, retains them on failed refresh, and isolates another account', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
  const page = { items: [{ id: 'saved-artwork' }], offset: 0, limit: 30, total: 1 };
  client.setQueryData(artworkLibraryQueryKey('user'), { pages: [page], pageParams: [0] });
  mocks.fetchPage.mockRejectedValue(new Error('offline'));
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const hook = renderHook(({ userId }) => useArtworkPicker(userId, true), { initialProps: { userId: 'user' }, wrapper });
  expect(hook.result.current.items.map((item) => item.id)).toEqual(['saved-artwork']);
  await waitFor(() => expect(hook.result.current.error).not.toBeNull());
  expect(hook.result.current.items).toHaveLength(1);
  mocks.fetchPage.mockResolvedValue({ ...page, items: [], total: 0 });
  hook.rerender({ userId: 'other' });
  expect(hook.result.current.items).toEqual([]);
  await waitFor(() => expect(mocks.fetchPage).toHaveBeenLastCalledWith('other', 0, 30));
  await act(async () => { await hook.result.current.reload(); });
  hook.unmount(); client.clear();
});
