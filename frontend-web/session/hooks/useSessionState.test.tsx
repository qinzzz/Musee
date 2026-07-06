import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionState } from './useSessionState';
import type { SessionStreamMessage } from '../types';

const { mockFetchSessions, mockUpdateSession } = vi.hoisted(() => ({
  mockFetchSessions: vi.fn(),
  mockUpdateSession: vi.fn(),
}));

vi.mock('../api/sessions', () => ({
  fetchSessions: mockFetchSessions,
  updateSession: mockUpdateSession,
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

  it('renames a persisted session optimistically and rolls back on failure', async () => {
    mockFetchSessions.mockResolvedValue([
      { id: 'session-1', user_id: 'user-1', title: 'Frank Stella' },
    ]);

    const { result } = renderSessionState();

    await waitFor(() => {
      expect(result.current.persistedSessions[0]?.title).toBe('Frank Stella');
    });

    // Success path: title paints immediately, then the refetch confirms it.
    let resolveRename!: (value: unknown) => void;
    mockUpdateSession.mockReturnValue(new Promise((resolve) => {
      resolveRename = resolve;
    }));
    let renamePromise!: Promise<void>;
    act(() => {
      renamePromise = result.current.renamePersistedSession('session-1', 'Museum Visit');
    });

    await waitFor(() => {
      expect(result.current.persistedSessions[0]?.title).toBe('Museum Visit');
    });
    expect(mockUpdateSession).toHaveBeenCalledWith('session-1', 'user-1', 'Museum Visit');

    mockFetchSessions.mockResolvedValue([
      { id: 'session-1', user_id: 'user-1', title: 'Museum Visit' },
    ]);
    await act(async () => {
      resolveRename({ ok: true });
      await renamePromise;
    });
    await waitFor(() => {
      expect(result.current.persistedSessions[0]?.title).toBe('Museum Visit');
    });

    // Failure path: optimistic title rolls back to the last confirmed value.
    mockUpdateSession.mockRejectedValue(new Error('rename failed'));
    await act(async () => {
      await expect(
        result.current.renamePersistedSession('session-1', 'Doomed Title'),
      ).rejects.toThrow('rename failed');
    });
    expect(result.current.persistedSessions[0]?.title).toBe('Museum Visit');
  });

  it('derives session goals from backend records with a memory-only override', async () => {
    localStorage.setItem('musee_session_goals', JSON.stringify({ 'session-1': 'stale local goal' }));
    mockFetchSessions.mockResolvedValue([
      {
        id: 'session-1',
        user_id: 'user-1',
        title: 'Frank Stella',
        metadata: { user_goal: 'Study color fields' },
      },
    ]);

    const { result } = renderSessionState();

    // Backend is canonical: the goal comes from the session record, and the
    // retired localStorage key is cleared, not read.
    await waitFor(() => {
      expect(result.current.sessionGoals['session-1']).toBe('Study color fields');
      expect(localStorage.getItem('musee_session_goals')).toBeNull();
    });

    // Saving a goal for a persisted session paints immediately (optimistic
    // patch into the query cache) without persisting locally.
    act(() => {
      result.current.setSessionGoal('session-1', 'Compare brushwork');
    });
    await waitFor(() => {
      expect(result.current.sessionGoals['session-1']).toBe('Compare brushwork');
    });
    expect(localStorage.getItem('musee_session_goals')).toBeNull();

    // The backend always wins on refetch: a change made on another device is
    // never masked by the local copy.
    mockFetchSessions.mockResolvedValue([
      {
        id: 'session-1',
        user_id: 'user-1',
        title: 'Frank Stella',
        metadata: { user_goal: 'Changed on another device' },
      },
    ]);
    act(() => {
      result.current.refreshPersistedSessions();
    });
    await waitFor(() => {
      expect(result.current.sessionGoals['session-1']).toBe('Changed on another device');
    });

    // Goals for not-yet-persisted sessions live in the memory-only draft map.
    act(() => {
      result.current.setSessionGoal('draft-1', 'Pre-persist goal');
    });
    await waitFor(() => {
      expect(result.current.sessionGoals['draft-1']).toBe('Pre-persist goal');
    });
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
