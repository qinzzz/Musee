// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ search: vi.fn() }));
vi.mock('../platform/places/applePlaces', () => ({ applePlaces: mocks }));
import { usePlaceSearch, PLACE_SEARCH_DELAY_MS } from './usePlaceSearch';

beforeEach(() => { vi.useFakeTimers(); vi.resetAllMocks(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
const advance = () => act(async () => { await vi.advanceTimersByTimeAsync(PLACE_SEARCH_DELAY_MS); });

it('does not disclose GPS until a search is typed and debounced', async () => {
  const hook = renderHook(({ query }) => usePlaceSearch(query, true, { latitude: 0, longitude: 0 }),
    { initialProps: { query: '' } });
  await advance();
  expect(mocks.search).not.toHaveBeenCalled();
  mocks.search.mockResolvedValue([]);
  hook.rerender({ query: 'Louvre' });
  expect(mocks.search).not.toHaveBeenCalled();
  await advance();
  expect(mocks.search).toHaveBeenCalledWith('Louvre', { latitude: 0, longitude: 0 });
});

it('ignores out-of-order results and pending results after manual entry', async () => {
  let first!: (value: unknown[]) => void;
  mocks.search.mockReturnValueOnce(new Promise((resolve) => { first = resolve; }));
  const hook = renderHook(({ query, enabled }) => usePlaceSearch(query, enabled),
    { initialProps: { query: 'Old', enabled: true } });
  await advance();
  mocks.search.mockResolvedValueOnce([{ id: 'new', name: 'New' }]);
  hook.rerender({ query: 'New', enabled: true });
  await advance();
  await act(async () => { first([{ id: 'old' }]); });
  expect(hook.result.current.results[0].id).toBe('new');
  hook.rerender({ query: 'New', enabled: false });
  expect(hook.result.current.results).toEqual([]);
});

it('exposes failure without making a false no-results claim', async () => {
  mocks.search.mockRejectedValue(new Error('Offline'));
  const hook = renderHook(() => usePlaceSearch('Museum', true));
  await advance();
  expect(hook.result.current.error).toBe('Offline');
  expect(hook.result.current.searching).toBe(false);
});
