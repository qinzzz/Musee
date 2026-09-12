// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { MobileArtworkRecord } from './types';
import type { ApplePlace } from '../platform/places/applePlaces';
const mocks = vi.hoisted(() => ({ resolve: vi.fn() }));
vi.mock('../platform/places/applePlaces', () => ({ applePlaces: mocks }));
import { useCapturePlace } from './useCapturePlace';
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const place = { id: 'apple-id', name: 'Saved Museum', address: 'City', category: 'Museum', latitude: 1, longitude: 2 };
const artwork = { id: 'art', museumName: 'Saved Museum', captureLocationOverride: {
  status: 'selected', source: 'apple_maps', place_id: 'apple-id',
} } as MobileArtworkRecord;

it('resolves the saved ID into a map pin without searching by name', async () => {
  mocks.resolve.mockResolvedValue(place);
  const hook = renderHook(() => useCapturePlace(artwork));
  expect(hook.result.current.resolving).toBe(true);
  await waitFor(() => expect(hook.result.current.mapPin).toEqual(place));
  expect(mocks.resolve).toHaveBeenCalledWith('apple-id');
  expect(hook.result.current.resolving).toBe(false);
});

it('ignores a delayed previous location and keeps the correct label when lookup fails', async () => {
  let finish!: (place: ApplePlace) => void;
  mocks.resolve.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
  const hook = renderHook(({ value }) => useCapturePlace(value), { initialProps: { value: artwork } });
  await waitFor(() => expect(mocks.resolve).toHaveBeenCalled());
  mocks.resolve.mockRejectedValue(new Error('Offline'));
  hook.rerender({ value: { ...artwork, museumName: 'Other Place', captureLocationOverride: {
    status: 'selected', source: 'apple_maps', place_id: 'other-id',
  } } });
  await waitFor(() => expect(hook.result.current.resolving).toBe(false));
  await act(async () => { finish(place); });
  expect(hook.result.current.mapPin).toBeNull();
  expect(hook.result.current.placeName).toBe('Other Place');
});

it('uses catalogue coordinates for a museum, but never for a manual override or removal', () => {
  const value: MobileArtworkRecord = { ...artwork, captureLocationOverride: null,
    captureMuseum: { id: 'museum', canonical_name: 'Saved Museum', latitude: 1, longitude: 2 } };
  const hook = renderHook(({ value }) => useCapturePlace(value), { initialProps: { value } });
  expect(hook.result.current.mapPin).toMatchObject({ id: 'museum:museum', latitude: 1, longitude: 2 });
  hook.rerender({ value: { ...value, captureLocationOverride: { status: 'selected', source: 'manual', name: 'A café' } } });
  expect(hook.result.current.mapPin).toBeNull();
  hook.rerender({ value: { ...value, captureLocationOverride: { status: 'removed' } } });
  expect(hook.result.current.mapPin).toBeNull();
  expect(mocks.resolve).not.toHaveBeenCalled();
});
