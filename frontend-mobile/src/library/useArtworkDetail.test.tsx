// @vitest-environment jsdom
import { useEffect, type PropsWithChildren } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { MobileArtworkRecord } from './types';

vi.hoisted(() => { vi.stubGlobal('__DEV__', false); });
const mocks = vi.hoisted(() => ({ fetchArtwork: vi.fn(), updateArtwork: vi.fn(), identifyAgain: vi.fn(), deleteArtwork: vi.fn(), analyzeArtwork: vi.fn() }));
vi.mock('../api/runtime', () => ({ MOBILE_API_BASE_URL: '/api', mobileArtworkLibraryService: mocks, mobileArtworkAnalysisService: mocks }));
vi.mock('expo-router', () => ({ useFocusEffect: (callback: () => void) => useEffect(callback, [callback]) }));
vi.mock('../ui/toast', () => ({ showToast: vi.fn(), showPendingToast: vi.fn(), hideToast: vi.fn() }));
import { useArtworkDetail } from './useArtworkDetail';
import { artworkDetailKey } from './artworkQueries';
const artwork: MobileArtworkRecord = {
  id: 'art', photoUri: '/art', thumbnailUri: null, resolvedImageUri: '/art', resolvedThumbnailUri: '/art',
  cacheKey: 'art', thumbnailCacheKey: 'art', artworkName: 'Original', artistName: 'Artist', analysis: 'Analysis',
  analysisStatus: 'analyzed', analysisError: null, date: null, medium: null, movement: null, periodBucket: null,
  tags: [], isDeleted: false, createdAt: null,
};
let client: QueryClient;
const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
beforeEach(() => { vi.resetAllMocks(); client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } }); mocks.fetchArtwork.mockResolvedValue(artwork); });
afterEach(() => { cleanup(); client.clear(); });

it('a refresh started before an edit cannot overwrite the saved artwork', async () => {
  const hook = renderHook(() => useArtworkDetail('user', 'art'), { wrapper });
  await waitFor(() => expect(hook.result.current.artwork?.artworkName).toBe('Original'));
  let finish!: (value: MobileArtworkRecord) => void;
  mocks.fetchArtwork.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
  act(() => { void hook.result.current.loadArtwork(); });
  const edited = { ...artwork, artworkName: 'Edited' };
  mocks.updateArtwork.mockResolvedValue(edited);
  await act(async () => { await hook.result.current.updateArtwork({ artworkName: 'Edited' }); });
  await act(async () => { finish(artwork); });
  await waitFor(() => expect(hook.result.current.artwork?.artworkName).toBe('Edited'));
  expect(client.getQueryData(artworkDetailKey('user', 'art'))).toEqual(edited);
});

it('retains the last record on failed refresh, and requires only a read after a successful identify with failed reload', async () => {
  const hook = renderHook(() => useArtworkDetail('user', 'art'), { wrapper });
  await waitFor(() => expect(hook.result.current.artwork).not.toBeNull());
  mocks.identifyAgain.mockResolvedValue(undefined);
  mocks.fetchArtwork.mockRejectedValue(new Error('offline'));
  await act(async () => { await hook.result.current.identifyAgain({ artworkName: 'Clue', artistName: '', additionalClue: '' }); });
  expect(hook.result.current.actionError?.action).toBe('refresh');
  expect(hook.result.current.artwork).toEqual(artwork);
  mocks.fetchArtwork.mockResolvedValue({ ...artwork, artworkName: 'Identified' });
  await act(async () => { await hook.result.current.loadArtwork(); });
  await waitFor(() => expect(hook.result.current.artwork?.artworkName).toBe('Identified'));
  expect(mocks.identifyAgain).toHaveBeenCalledTimes(1);
});

it('isolates detail reads by account and ignores a mutation completed after unmount', async () => {
  const hook = renderHook(() => useArtworkDetail('user', 'art'), { wrapper });
  await waitFor(() => expect(hook.result.current.artwork).not.toBeNull());
  let finish!: (value: MobileArtworkRecord) => void;
  mocks.updateArtwork.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  let save!: Promise<MobileArtworkRecord | undefined>;
  act(() => { save = hook.result.current.updateArtwork({ artworkName: 'Late edit' }); });
  await waitFor(() => expect(mocks.updateArtwork).toHaveBeenCalled());
  hook.unmount(); client.clear();
  await act(async () => { finish({ ...artwork, artworkName: 'Late edit' }); await save; });
  expect(client.getQueryData(artworkDetailKey('user', 'art'))).toBeUndefined();
  expect(client.getQueryData(artworkDetailKey('other', 'art'))).toBeUndefined();
});
