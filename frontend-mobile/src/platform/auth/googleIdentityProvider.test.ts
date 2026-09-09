import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({ configure: vi.fn(), signIn: vi.fn(), signOut: vi.fn(), nativeModule: vi.fn() }));
vi.mock('react-native', () => ({ Platform: { OS: 'ios' }, TurboModuleRegistry: { get: sdk.nativeModule } }));
vi.mock('@react-native-google-signin/google-signin', () => ({ GoogleSignin: sdk }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID', 'web.apps.googleusercontent.com');
  vi.stubEnv('EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID', 'ios.apps.googleusercontent.com');
  sdk.nativeModule.mockReturnValue({});
  sdk.signOut.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

it('requests a web-audience ID token using the iOS client and resets previous Google selection', async () => {
  sdk.signIn.mockResolvedValue({ type: 'success', data: { idToken: 'verified-by-server' } });
  const { googleIdentityProvider } = await import('./googleIdentityProvider');
  await expect(googleIdentityProvider.signIn()).resolves.toBe('verified-by-server');
  expect(sdk.configure).toHaveBeenCalledWith({ webClientId: 'web.apps.googleusercontent.com', iosClientId: 'ios.apps.googleusercontent.com', offlineAccess: false });
  expect(sdk.signOut.mock.invocationCallOrder[0]).toBeLessThan(sdk.signIn.mock.invocationCallOrder[0]);
});

it('returns null for cancellation and rejects success without an ID token', async () => {
  sdk.signIn.mockResolvedValueOnce({ type: 'cancelled', data: null }).mockResolvedValueOnce({ type: 'success', data: { idToken: null } });
  const { googleIdentityProvider } = await import('./googleIdentityProvider');
  await expect(googleIdentityProvider.signIn()).resolves.toBeNull();
  await expect(googleIdentityProvider.signIn()).rejects.toMatchObject({ code: 'missing_token' });
});

it('keeps an old development binary usable without loading the Google SDK', async () => {
  sdk.nativeModule.mockReturnValue(null);
  const { googleSignInAvailable, googleIdentityProvider } = await import('./googleIdentityProvider');
  expect(googleSignInAvailable).toBe(false);
  await expect(googleIdentityProvider.signIn()).rejects.toMatchObject({ code: 'unavailable' });
  expect(sdk.configure).not.toHaveBeenCalled();
});

it('disables Google login without configuration', async () => {
  vi.stubEnv('EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID', '');
  const { googleSignInAvailable, googleIdentityProvider } = await import('./googleIdentityProvider');
  expect(googleSignInAvailable).toBe(false);
  await expect(googleIdentityProvider.signIn()).rejects.toMatchObject({ code: 'not_configured' });
});
