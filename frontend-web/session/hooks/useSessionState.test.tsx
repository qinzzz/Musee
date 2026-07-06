import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionState } from './useSessionState';
import type { SessionStreamMessage } from '../types';

const { mockFetchSessions } = vi.hoisted(() => ({
  mockFetchSessions: vi.fn(),
}));

vi.mock('../api/sessions', () => ({
  fetchSessions: mockFetchSessions,
}));

function renderSessionState() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useSessionState({
    userId: 'user-1',
    items: [],
    artworksLoaded: true,
    deleteConfirmation: null,
    defaultSessionTitle: 'Untitled Session',
    sessionGoalsStorageKey: 'test_session_goals',
    persistedSessionsStorageKey: 'test_persisted_sessions',
  }), { wrapper });
}

describe('useSessionState', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('keeps the last persisted session titles when a refresh fails', async () => {
    mockFetchSessions.mockResolvedValueOnce([
      {
        id: 'session-1',
        user_id: 'user-1',
        title: 'Frank Stella',
      },
    ]);

    const { result } = renderSessionState();

    await waitFor(() => {
      expect(result.current.persistedSessions).toEqual([
        expect.objectContaining({
          id: 'session-1',
          title: 'Frank Stella',
        }),
      ]);
    });

    mockFetchSessions.mockRejectedValueOnce(new Error('timeout'));

    await act(async () => {
      result.current.refreshPersistedSessions();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.persistedSessions).toEqual([
        expect.objectContaining({
          id: 'session-1',
          title: 'Frank Stella',
        }),
      ]);
      expect(result.current.persistedSessionsHydrated).toBe(true);
    });
  });

  it('keeps session streams memory-only: no hydration from and no writes to localStorage', async () => {
    mockFetchSessions.mockResolvedValue([]);
    localStorage.setItem('musee_session_streams', JSON.stringify({
      'session-1': [{ id: 'ghost', role: 'user', text: 'stale', createdAt: 1 }],
    }));
    localStorage.setItem('musee_session_drafts', JSON.stringify([
      { id: 'session-ghost', title: 'Stale draft', createdAt: 1, updatedAt: 1 },
    ]));

    const { result } = renderSessionState();

    expect(result.current.sessionStreams).toEqual({});
    expect(result.current.sessionDrafts).toEqual([]);

    await waitFor(() => {
      expect(localStorage.getItem('musee_session_streams')).toBeNull();
      expect(localStorage.getItem('musee_session_drafts')).toBeNull();
    });

    const message: SessionStreamMessage = { id: 'm1', role: 'user', text: 'hi', createdAt: 10 };
    act(() => {
      result.current.setSessionStreams({ 'session-1': [message] });
      result.current.setSessionDrafts([{ id: 'session-1', title: 'Draft', createdAt: 10, updatedAt: 10 }]);
    });

    expect(result.current.sessionStreams['session-1']).toEqual([message]);
    expect(localStorage.getItem('musee_session_streams')).toBeNull();
    expect(localStorage.getItem('musee_session_drafts')).toBeNull();
  });

  it('hydrates cached persisted sessions before the server refresh resolves', async () => {
    let resolveFetch!: (value: Array<{ id: string; user_id: string; title: string }>) => void;
    mockFetchSessions.mockReturnValue(new Promise((resolve) => {
      resolveFetch = resolve;
    }));
    localStorage.setItem('test_persisted_sessions', JSON.stringify({
      userId: 'user-1',
      sessions: [
        {
          id: 'session-1',
          user_id: 'user-1',
          title: 'Cached Session',
        },
      ],
    }));

    const { result } = renderSessionState();

    expect(result.current.persistedSessions).toEqual([
      expect.objectContaining({
        id: 'session-1',
        title: 'Cached Session',
      }),
    ]);
    expect(result.current.persistedSessionsHydrated).toBe(false);

    await act(async () => {
      resolveFetch([
        {
          id: 'session-1',
          user_id: 'user-1',
          title: 'Server Session',
        },
      ]);
    });

    await waitFor(() => {
      expect(result.current.persistedSessions).toEqual([
        expect.objectContaining({
          id: 'session-1',
          title: 'Server Session',
        }),
      ]);
      expect(result.current.persistedSessionsHydrated).toBe(true);
    });
  });
});
