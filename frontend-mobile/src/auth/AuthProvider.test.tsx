// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  restoreSession: vi.fn(), loginWithGoogle: vi.fn(), loginWithEmail: vi.fn(), logout: vi.fn(), clear: vi.fn(),
}));
vi.mock('../api/runtime', () => ({
  MOBILE_API_BASE_URL: '/api', mobileApiClient: {}, mobileAuthService: mocks,
  subscribeToMobileAuthenticationRequired: () => () => {},
}));
vi.mock('../api/queryClient', () => ({ mobileQueryClient: { clear: mocks.clear } }));
import { AuthProvider, useAuth } from './AuthProvider';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.restoreSession.mockResolvedValue(false);
  mocks.logout.mockResolvedValue(undefined);
});
afterEach(cleanup);

async function mount() {
  const hook = renderHook(() => useAuth(), { wrapper: AuthProvider });
  await waitFor(() => expect(hook.result.current.status).toBe('signedOut'));
  return hook;
}

it('returns quietly to signed-out state when Google is cancelled', async () => {
  mocks.loginWithGoogle.mockResolvedValue(null);
  const { result } = await mount();
  await act(() => result.current.loginWithGoogle());
  expect(result.current.status).toBe('signedOut');
  expect(result.current.user).toBeNull();
  expect(mocks.clear).not.toHaveBeenCalled();
});

it('accepts the backend account and clears old cached data', async () => {
  mocks.loginWithGoogle.mockResolvedValue({ user: { user_id: 'existing-web-user' } });
  const { result } = await mount();
  await act(() => result.current.loginWithGoogle());
  expect(result.current.status).toBe('authenticated');
  expect(result.current.user?.user_id).toBe('existing-web-user');
  expect(mocks.clear).toHaveBeenCalledOnce();
});

it('blocks another provider login while Google is pending', async () => {
  let finish!: (value: null) => void;
  mocks.loginWithGoogle.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const { result } = await mount();
  let pending!: Promise<void>;
  act(() => { pending = result.current.loginWithGoogle(); });
  await act(() => result.current.loginWithEmail('user@example.com', 'password'));
  expect(mocks.loginWithEmail).not.toHaveBeenCalled();
  await act(async () => { finish(null); await pending; });
  expect(result.current.status).toBe('signedOut');
});

it('rejects an incomplete backend account and permits another attempt after failure', async () => {
  mocks.loginWithGoogle.mockResolvedValue({ access_token: 'invalid-response' });
  const { result } = await mount();
  await act(async () => {
    await expect(result.current.loginWithGoogle()).rejects.toMatchObject({ name: 'MobileAuthContractError' });
  });
  expect(mocks.logout).toHaveBeenCalledOnce();
  expect(result.current.status).toBe('signedOut');
  mocks.loginWithGoogle.mockResolvedValue(null);
  await act(() => result.current.loginWithGoogle());
  expect(mocks.loginWithGoogle).toHaveBeenCalledTimes(2);
});
