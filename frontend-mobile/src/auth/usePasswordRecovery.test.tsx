// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ requestReset: vi.fn() }));
vi.mock('../api/runtime', () => ({ MOBILE_API_BASE_URL: '/api', mobilePasswordRecoveryService: mocks }));
import { usePasswordRecovery } from './usePasswordRecovery';
import { MobileAuthHttpError } from './mobileAuthTransport';
afterEach(() => { cleanup(); vi.useRealTimers(); vi.resetAllMocks(); });

it('validates email, prevents duplicate sends, and supports requesting another link', async () => {
  const { result } = renderHook(usePasswordRecovery);
  await act(() => result.current.submit());
  expect(result.current.error).toContain('valid email');
  expect(mocks.requestReset).not.toHaveBeenCalled();
  act(() => result.current.setEmail(' person@example.com '));
  let finish!: () => void;
  mocks.requestReset.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
  let pending!: Promise<void>;
  act(() => { pending = result.current.submit(); });
  expect(result.current.sending).toBe(true);
  await act(() => result.current.submit());
  expect(mocks.requestReset).toHaveBeenCalledOnce();
  expect(mocks.requestReset).toHaveBeenCalledWith('person@example.com');
  await act(async () => { finish(); await pending; });
  expect(result.current.sent).toBe(true);
  expect(result.current.sending).toBe(false);
  act(() => result.current.editEmail());
  expect(result.current.sent).toBe(false);
  expect(result.current.email).toBe(' person@example.com ');
});

it('shows rate-limit recovery and permits retry after a failed request', async () => {
  vi.useFakeTimers();
  const { result } = renderHook(usePasswordRecovery);
  act(() => result.current.setEmail('person@example.com'));
  mocks.requestReset.mockRejectedValueOnce(new MobileAuthHttpError(429, null));
  await act(() => result.current.submit());
  expect(result.current.error).toContain('countdown');
  expect(result.current.remainingSeconds).toBe(300);
  expect(result.current.sent).toBe(false);
  expect(result.current.sending).toBe(false);
  mocks.requestReset.mockResolvedValueOnce(undefined);
  await act(() => result.current.submit());
  expect(mocks.requestReset).toHaveBeenCalledOnce();
  act(() => { vi.advanceTimersByTime(300_000); });
  await act(() => result.current.submit());
  expect(result.current.sent).toBe(true);
  expect(result.current.error).toBeNull();
});

it('blocks resends for 60 seconds, retains the cooldown while editing, and accounts for elapsed background time', async () => {
  vi.useFakeTimers();
  const { result } = renderHook(usePasswordRecovery);
  act(() => result.current.setEmail('person@example.com'));
  mocks.requestReset.mockResolvedValue(undefined);
  await act(() => result.current.submit());
  expect(result.current.remainingSeconds).toBe(60);
  act(() => { vi.advanceTimersByTime(1000); });
  expect(result.current.remainingSeconds).toBe(59);
  await act(() => result.current.submit());
  expect(mocks.requestReset).toHaveBeenCalledOnce();
  act(() => { result.current.editEmail(); result.current.setEmail('other@example.com'); });
  expect(result.current.remainingSeconds).toBe(59);
  // Simulate the clock advancing while JS timers were suspended.
  vi.setSystemTime(Date.now() + 60_000);
  act(() => { vi.advanceTimersByTime(1000); });
  expect(result.current.remainingSeconds).toBe(0);
  await act(() => result.current.submit());
  expect(mocks.requestReset).toHaveBeenCalledTimes(2);
  expect(result.current.remainingSeconds).toBe(60);
});

it('uses the server retry interval and keeps confirmation visible when a resend fails', async () => {
  vi.useFakeTimers();
  const { result } = renderHook(usePasswordRecovery);
  act(() => result.current.setEmail('person@example.com'));
  mocks.requestReset.mockResolvedValueOnce(undefined);
  await act(() => result.current.submit());
  act(() => { vi.advanceTimersByTime(60_000); });
  mocks.requestReset.mockRejectedValueOnce(new MobileAuthHttpError(429, null, 120));
  await act(() => result.current.submit());
  expect(result.current.remainingSeconds).toBe(120);
  expect(result.current.sent).toBe(true);
  expect(result.current.error).toContain('countdown');
});
