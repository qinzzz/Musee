// @vitest-environment jsdom
import { useEffect, type PropsWithChildren } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SessionEventRecord } from '@musee/client-core';

vi.hoisted(() => { vi.stubGlobal('__DEV__', false); });
const mocks = vi.hoisted(() => ({
  fetchSession: vi.fn(), fetchEvents: vi.fn(), fetchArtworks: vi.fn(),
  createTextAttempt: vi.fn(), commitTextTurn: vi.fn(), persistPendingResponse: vi.fn(),
  persistResponse: vi.fn(), streamResponse: vi.fn(),
}));
vi.mock('expo-router', () => ({ useFocusEffect: (callback: () => void) => useEffect(callback, [callback]) }));
vi.mock('../api/runtime', () => ({
  MOBILE_API_BASE_URL: 'https://example.com/api', mobileSessionService: mocks,
  mobileSessionContextService: {},
}));
import { useMobileTextSession } from './useMobileTextSession';
import { sessionKeys } from './sessionQueries';

let client: QueryClient;
const session = { id: 'saved', user_id: 'user', title: 'Saved' };
const userEvent: SessionEventRecord = { id: 'input', session_id: 'saved', role: 'user', event_type: 'user_input', content: 'Question' };
const responseEvent: SessionEventRecord = { id: 'response', session_id: 'saved', role: 'model', event_type: 'model_response', trigger_event_id: 'input', content: '', payload: { status: 'pending' } };
const turn = { userId: 'user', sessionId: 'saved', title: 'Saved', text: 'Question', userEvent, responseEvent };
const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
beforeEach(() => {
  vi.resetAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
  mocks.fetchSession.mockImplementation(async (id) => ({ ...session, id }));
  mocks.fetchEvents.mockResolvedValue([]); mocks.fetchArtworks.mockResolvedValue([]);
  mocks.createTextAttempt.mockReturnValue(turn); mocks.commitTextTurn.mockResolvedValue(session);
  mocks.persistPendingResponse.mockResolvedValue(undefined);
  mocks.persistResponse.mockImplementation(async (_turn, status, result) => ({ ...responseEvent, content: result?.response || '', payload: { status } }));
  mocks.streamResponse.mockResolvedValue({ response: 'Answer' });
});
afterEach(() => { cleanup(); client.clear(); });

it('adopts the saved ID without resetting an active conversation', async () => {
  let finish!: (result: { response: string }) => void;
  mocks.streamResponse.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const hook = renderHook(({ id }) => useMobileTextSession(id, 'user'), { initialProps: { id: 'new' }, wrapper });
  await act(async () => { await hook.result.current.sendText('Question'); });
  await waitFor(() => expect(hook.result.current.isSending).toBe(true));
  hook.rerender({ id: 'saved' });
  expect(hook.result.current.session?.id).toBe('saved');
  expect(hook.result.current.events).toHaveLength(2);
  expect(hook.result.current.isSending).toBe(true);
  expect(mocks.fetchEvents).not.toHaveBeenCalled();
  mocks.fetchEvents.mockResolvedValue([userEvent, { ...responseEvent, content: 'Answer', payload: { status: 'completed' } }]);
  await act(async () => { finish({ response: 'Answer' }); });
  await waitFor(() => expect(hook.result.current.events.at(-1)?.content).toBe('Answer'));
});

it('switches Sessions and ignores a previous conversation stream', async () => {
  let finish!: (result: { response: string }) => void;
  mocks.streamResponse.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const hook = renderHook(({ id }) => useMobileTextSession(id, 'user'), { initialProps: { id: 'saved' }, wrapper });
  await waitFor(() => expect(hook.result.current.session?.id).toBe('saved'));
  await act(async () => { await hook.result.current.sendText('Question'); });
  hook.rerender({ id: 'other' });
  await waitFor(() => expect(hook.result.current.session?.id).toBe('other'));
  await act(async () => { finish({ response: 'Late answer' }); });
  expect(hook.result.current.events).toEqual([]);
  expect(hook.result.current.isSending).toBe(false);
});

it('retains loaded events on refresh failure and isolates accounts', async () => {
  mocks.fetchEvents.mockResolvedValue([userEvent]);
  const hook = renderHook(({ userId }) => useMobileTextSession('saved', userId), { initialProps: { userId: 'user' }, wrapper });
  await waitFor(() => expect(hook.result.current.events).toHaveLength(1));
  mocks.fetchEvents.mockRejectedValue(new Error('offline'));
  await act(async () => { await hook.result.current.reload(); });
  await waitFor(() => expect(hook.result.current.loadError).not.toBeNull());
  expect(hook.result.current.events).toEqual([userEvent]);
  mocks.fetchEvents.mockResolvedValue([]);
  hook.rerender({ userId: 'other' });
  expect(hook.result.current.events).toEqual([]);
  await waitFor(() => expect(client.getQueryData(sessionKeys.detail('other', 'saved'))).toBeDefined());
});

it('a cached read cannot replace streaming text or an unsaved completed answer', async () => {
  const hook = renderHook(() => useMobileTextSession('saved', 'user'), { wrapper });
  await waitFor(() => expect(hook.result.current.session?.id).toBe('saved'));
  mocks.persistResponse.mockRejectedValue(new Error('save failed'));
  await act(async () => { await hook.result.current.sendText('Question'); });
  await waitFor(() => expect(hook.result.current.failure?.stage).toBe('response_save'));
  act(() => { client.setQueryData(sessionKeys.detail('user', 'saved'), { session, events: [userEvent, responseEvent], artworks: [] }); });
  expect(hook.result.current.events.at(-1)?.content).toBe('Answer');
  expect(hook.result.current.failure?.stage).toBe('response_save');
});
