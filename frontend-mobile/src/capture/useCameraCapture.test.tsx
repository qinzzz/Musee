// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { NativeImageAsset } from './types';

const mocks = vi.hoisted(() => ({ pick: vi.fn(), save: vi.fn(), refresh: vi.fn() }));
vi.mock('expo-camera', () => ({ CameraView: {}, useCameraPermissions: () => [{ granted: true }, vi.fn(), mocks.refresh] }));
vi.mock('expo-device', () => ({ isDevice: true }));
vi.mock('react-native', () => ({ AppState: { currentState: 'active', addEventListener: () => ({ remove: vi.fn() }) } }));
vi.mock('../platform/images/pickArtworkImage', () => ({ pickArtworkImage: mocks.pick }));
vi.mock('../platform/images/cameraPhotoAsset', () => ({ cameraPhotoAsset: vi.fn() }));
vi.mock('../platform/media/expoCameraRollAdapter', () => ({ expoCameraRollAdapter: {} }));
vi.mock('../platform/media/cameraRoll', async (original) => ({ ...await original<object>(), saveCapturedImage: mocks.save }));
import { useCameraCapture } from './useCameraCapture';
import { CameraRollPermissionError } from '../platform/media/cameraRoll';
const asset: NativeImageAsset = { uri: 'file://art.jpg', fileName: 'art.jpg', mimeType: 'image/jpeg', width: 100, height: 100, source: 'camera' };
afterEach(() => { cleanup(); vi.resetAllMocks(); });

it('keeps the artwork and optional label across a Photos-save failure and retry', async () => {
  const complete = vi.fn(); const close = vi.fn();
  const hook = renderHook(() => useCameraCapture(complete, close));
  mocks.pick.mockResolvedValueOnce(asset).mockResolvedValueOnce({ ...asset, uri: 'file://label.jpg' });
  await act(async () => { await hook.result.current.choosePhoto(); });
  act(() => hook.result.current.selectTarget('label'));
  await act(async () => { await hook.result.current.choosePhoto(); });
  mocks.save.mockRejectedValueOnce(new CameraRollPermissionError(false)).mockResolvedValueOnce(undefined);
  await act(async () => { await hook.result.current.usePhoto(); });
  expect(hook.result.current.allowUnsavedPhoto).toBe(true);
  expect(complete).not.toHaveBeenCalled();
  await act(async () => { await hook.result.current.usePhoto(); });
  expect(complete).toHaveBeenCalledWith(asset, expect.objectContaining({ uri: 'file://label.jpg' }));
  expect(close).toHaveBeenCalledTimes(1);
});

it('suppresses duplicate picker requests and ignores results after leaving', async () => {
  let finish!: (value: NativeImageAsset) => void;
  mocks.pick.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const complete = vi.fn(); const close = vi.fn();
  const hook = renderHook(() => useCameraCapture(complete, close));
  let pending!: Promise<void>;
  act(() => { pending = hook.result.current.choosePhoto(); void hook.result.current.choosePhoto(); });
  expect(mocks.pick).toHaveBeenCalledTimes(1);
  act(() => hook.result.current.leaveCamera());
  await act(async () => { finish(asset); await pending; });
  expect(hook.result.current.artworkAsset).toBeNull();
  expect(complete).not.toHaveBeenCalled();
});
