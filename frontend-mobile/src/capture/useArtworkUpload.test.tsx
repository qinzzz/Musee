// @vitest-environment jsdom
import type { PropsWithChildren } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { NativeImageAsset, PendingArtworkUpload } from './types';

vi.hoisted(() => { vi.stubGlobal('__DEV__', false); });
const mocks = vi.hoisted(() => ({ uploadArtwork: vi.fn(), analyzeArtwork: vi.fn(), pick: vi.fn(), clearDraft: vi.fn(), toast: vi.fn() }));
vi.mock('../api/runtime', async () => {
  const { createMobileArtworkBatchService } = await import('./mobileArtworkBatchService');
  return { MOBILE_API_BASE_URL: '/api', mobileArtworkUploadService: mocks, mobileArtworkAnalysisService: mocks,
    mobileArtworkBatchService: createMobileArtworkBatchService({ uploadService: mocks, analysisService: mocks }) };
});
vi.mock('./CaptureDraftProvider', () => ({ useCaptureDraft: () => ({ draft: null, clearDraft: mocks.clearDraft }) }));
vi.mock('../platform/images/pickArtworkImage', () => ({ pickArtworkImages: mocks.pick }));
vi.mock('../ui/toast', () => ({ showToast: mocks.toast, showPendingToast: mocks.toast, hideToast: vi.fn() }));
import { useArtworkUpload } from './useArtworkUpload';
import { artworkLibraryQueryKey } from '../library/artworkLibraryQuery';

const asset: NativeImageAsset = { uri: 'file://art.jpg', fileName: 'art.jpg', mimeType: 'image/jpeg', width: 100, height: 100, source: 'camera' };
const saved: PendingArtworkUpload = { id: 'art', photoUri: '/art.jpg', thumbnailUri: null,
  resolvedImageUri: '/art.jpg', resolvedThumbnailUri: '/art.jpg', cacheKey: 'art', thumbnailCacheKey: 'art',
  analysisStatus: 'pending', artistName: 'Artist', artworkName: 'Work' };
let client: QueryClient;
const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
beforeEach(() => { vi.resetAllMocks(); client = new QueryClient(); mocks.uploadArtwork.mockResolvedValue(saved); });
afterEach(() => { cleanup(); client.clear(); });

it('retains the saved artwork and label when analysis fails, so retry does not reupload', async () => {
  mocks.analyzeArtwork.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ ...saved, analysisStatus: 'analyzed' });
  const hook = renderHook(() => useArtworkUpload('user'), { wrapper });
  const label = { ...asset, uri: 'file://label.jpg' };
  await act(async () => { await hook.result.current.uploadPhoto(asset, label); });
  const state = hook.result.current.capture;
  expect(state.status).toBe('analysis-error');
  if (state.status !== 'analysis-error') throw new Error('Expected retry checkpoint');
  client.setQueryData(artworkLibraryQueryKey('user'), { pages: [], pageParams: [] });
  await act(async () => { await hook.result.current.analyzeArtwork(state.artwork); });
  expect(client.getQueryState(artworkLibraryQueryKey('user'))?.isInvalidated).toBe(true);
  expect(mocks.uploadArtwork).toHaveBeenCalledTimes(1);
  expect(mocks.analyzeArtwork).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'art', labelAsset: label }), expect.any(Function));
  expect(hook.result.current.capture.status).toBe('analyzed');
});

it('locks duplicate uploads immediately and stops subsequent analysis after unmount', async () => {
  let finish!: (value: PendingArtworkUpload) => void;
  mocks.uploadArtwork.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const hook = renderHook(() => useArtworkUpload('user'), { wrapper });
  let upload!: Promise<void>;
  act(() => { upload = hook.result.current.uploadPhoto(asset); void hook.result.current.uploadPhoto(asset); });
  expect(mocks.uploadArtwork).toHaveBeenCalledTimes(1);
  hook.unmount();
  const toastCount = mocks.toast.mock.calls.length;
  await act(async () => { finish(saved); await upload; });
  expect(mocks.analyzeArtwork).not.toHaveBeenCalled();
  expect(mocks.toast).toHaveBeenCalledTimes(toastCount);
});

it('does not continue uploading a batch or begin analysis after leaving', async () => {
  let finish!: (value: PendingArtworkUpload) => void;
  mocks.uploadArtwork.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  mocks.pick.mockResolvedValue({ assets: [asset, { ...asset, uri: 'file://second.jpg' }], rejectedCount: 0 });
  const hook = renderHook(() => useArtworkUpload('user'), { wrapper });
  await act(async () => { await hook.result.current.choosePhoto(); });
  const state = hook.result.current.capture;
  if (state.status !== 'batch') throw new Error('Expected batch');
  let pending!: Promise<void>;
  act(() => { pending = hook.result.current.runBatch(state.entries); });
  await waitFor(() => expect(mocks.uploadArtwork).toHaveBeenCalledTimes(1));
  hook.unmount();
  await act(async () => { finish(saved); await pending; });
  expect(mocks.uploadArtwork).toHaveBeenCalledTimes(1);
  expect(mocks.analyzeArtwork).not.toHaveBeenCalled();
});
