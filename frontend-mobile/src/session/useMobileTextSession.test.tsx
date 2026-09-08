// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.hoisted(() => { vi.stubGlobal('__DEV__', false); });

const mocks = vi.hoisted(() => ({
  reset: vi.fn(),
  fetchSessions: vi.fn(),
  fetchEvents: vi.fn(),
  fetchArtworks: vi.fn(),
}));
vi.mock('expo-router', () => ({ useFocusEffect: vi.fn() }));
vi.mock('react-native', () => ({ AppState: { addEventListener: vi.fn() } }));
vi.mock('../api/runtime', () => ({
  MOBILE_API_BASE_URL: 'https://example.com/api',
  mobileSessionService: mocks,
}));
vi.mock('./useMobileSessionMessaging', () => ({
  useMobileSessionMessaging: () => ({ reset: mocks.reset, isSending: false }),
}));
import { useMobileTextSession } from './useMobileTextSession';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchSessions.mockResolvedValue([
    { id: 'saved', user_id: 'user', title: 'Saved' },
    { id: 'other', user_id: 'user', title: 'Other' },
  ]);
  mocks.fetchEvents.mockResolvedValue([]);
  mocks.fetchArtworks.mockResolvedValue([]);
});
afterEach(cleanup);

it('adopts the saved ID without resetting or reloading the current conversation', () => {
  const { result, rerender } = renderHook(({ id }) => useMobileTextSession(id, 'user'), {
    initialProps: { id: 'new' },
  });
  act(() => result.current.updateSession({ id: 'saved', user_id: 'user', title: 'Saved' }));
  mocks.reset.mockClear();
  rerender({ id: 'saved' });
  expect(result.current.session?.id).toBe('saved');
  expect(result.current.isLoading).toBe(false);
  expect(mocks.reset).not.toHaveBeenCalled();
  expect(mocks.fetchEvents).not.toHaveBeenCalled();
});

it('still loads a different Session and supports an explicit reload after promotion', async () => {
  const { result, rerender } = renderHook(({ id }) => useMobileTextSession(id, 'user'), {
    initialProps: { id: 'new' },
  });
  act(() => result.current.updateSession({ id: 'saved', user_id: 'user', title: 'Saved' }));
  rerender({ id: 'saved' });
  await act(() => result.current.reload());
  expect(mocks.fetchEvents).toHaveBeenCalledWith('saved');
  rerender({ id: 'other' });
  await waitFor(() => expect(result.current.session?.id).toBe('other'));
  expect(mocks.fetchEvents).toHaveBeenCalledWith('other');
});
