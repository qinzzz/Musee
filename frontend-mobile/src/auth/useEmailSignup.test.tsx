// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ signup: vi.fn() }));
vi.mock('../api/runtime', () => ({ MOBILE_API_BASE_URL: '/api', mobileEmailSignupService: mocks }));
import { useEmailSignup } from './useEmailSignup';
import { MobileAuthHttpError } from './mobileAuthTransport';
afterEach(() => { cleanup(); vi.useRealTimers(); vi.resetAllMocks(); });

function mount() {
  const hook = renderHook(useEmailSignup);
  act(() => {
    hook.result.current.setEmail('person@example.com');
    hook.result.current.setPassword('long-password');
    hook.result.current.setConfirmation('long-password');
  });
  return hook;
}

it('validates email, password length, and confirmation before any request', async () => {
  const { result } = mount();
  act(() => result.current.setEmail('invalid'));
  await act(() => result.current.submit());
  expect(result.current.error).toContain('valid email');
  act(() => { result.current.setEmail('person@example.com'); result.current.setPassword('short'); });
  await act(() => result.current.submit());
  expect(result.current.error).toContain('8 characters');
  act(() => result.current.setPassword('another-long-password'));
  await act(() => result.current.submit());
  expect(result.current.error).toContain('do not match');
  expect(mocks.signup).not.toHaveBeenCalled();
});

it('prevents duplicate signup, waits for verification, and resends after cooldown', async () => {
  vi.useFakeTimers();
  const { result } = mount();
  let finish!: (value: { emailSent: boolean }) => void;
  mocks.signup.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
  let pending!: Promise<void>;
  act(() => { pending = result.current.submit(); });
  await act(() => result.current.submit());
  expect(mocks.signup).toHaveBeenCalledOnce();
  await act(async () => { finish({ emailSent: true }); await pending; });
  expect(result.current.pendingVerification).toBe(true);
  expect(result.current.remainingSeconds).toBe(60);
  await act(() => result.current.submit());
  expect(mocks.signup).toHaveBeenCalledOnce();
  act(() => vi.advanceTimersByTime(60_000));
  mocks.signup.mockResolvedValueOnce({ emailSent: true });
  await act(() => result.current.submit());
  expect(mocks.signup).toHaveBeenLastCalledWith('person@example.com', 'long-password');
  expect(mocks.signup).toHaveBeenCalledTimes(2);
});

it('does not claim delivery when the backend could not send the verification email', async () => {
  const { result } = mount();
  mocks.signup.mockResolvedValueOnce({ emailSent: false });
  await act(() => result.current.submit());
  expect(result.current.pendingVerification).toBe(true);
  expect(result.current.emailSent).toBe(false);
  expect(result.current.error).toContain('could not send');
});

it('guides existing users to sign in and respects server retry time', async () => {
  vi.useFakeTimers();
  const { result } = mount();
  mocks.signup.mockRejectedValueOnce(new MobileAuthHttpError(409, 'email_exists'));
  await act(() => result.current.submit());
  expect(result.current.error).toContain('already exists');
  expect(result.current.pendingVerification).toBe(false);
  mocks.signup.mockRejectedValueOnce(new MobileAuthHttpError(429, null, 120));
  await act(() => result.current.submit());
  expect(result.current.remainingSeconds).toBe(120);
  act(() => result.current.edit());
  await act(() => result.current.submit());
  expect(mocks.signup).toHaveBeenCalledTimes(2);
});
