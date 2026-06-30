import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionState } from './useSessionState';

const { mockFetchSessions } = vi.hoisted(() => ({
  mockFetchSessions: vi.fn(),
}));

vi.mock('../api/sessions', () => ({
  fetchSessions: mockFetchSessions,
}));

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

    const { result } = renderHook(() => useSessionState({
      userId: 'user-1',
      items: [],
      artworksLoaded: true,
      deleteConfirmation: null,
      defaultSessionTitle: 'Untitled Session',
      sessionDraftsStorageKey: 'test_session_drafts',
      sessionStreamsStorageKey: 'test_session_streams',
      sessionGoalsStorageKey: 'test_session_goals',
    }));

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

  it('migrates cached session stream turnId values into triggerEventId', async () => {
    mockFetchSessions.mockResolvedValue([]);
    localStorage.setItem('test_session_streams', JSON.stringify({
      'session-1': [
        {
          id: 'msg-1',
          role: 'user',
          text: 'hello',
          turnId: 'legacy-turn',
          createdAt: 123,
        },
      ],
    }));

    const { result } = renderHook(() => useSessionState({
      userId: 'user-1',
      items: [],
      artworksLoaded: true,
      deleteConfirmation: null,
      defaultSessionTitle: 'Untitled Session',
      sessionDraftsStorageKey: 'test_session_drafts',
      sessionStreamsStorageKey: 'test_session_streams',
      sessionGoalsStorageKey: 'test_session_goals',
    }));

    await waitFor(() => {
      expect(result.current.sessionStreams['session-1']).toEqual([
        expect.objectContaining({
          id: 'msg-1',
          triggerEventId: 'legacy-turn',
        }),
      ]);
      expect(result.current.persistedSessionsHydrated).toBe(true);
    });
  });

  it('hydrates cached canonical user_input messages with triggerEventId from their own id', async () => {
    mockFetchSessions.mockResolvedValue([]);
    localStorage.setItem('test_session_streams', JSON.stringify({
      'session-1': [
        {
          id: 'evt-1',
          role: 'user',
          text: 'compare these different native community artworks',
          type: 'text',
          createdAt: 123,
        },
      ],
    }));

    const { result } = renderHook(() => useSessionState({
      userId: 'user-1',
      items: [],
      artworksLoaded: true,
      deleteConfirmation: null,
      defaultSessionTitle: 'Untitled Session',
      sessionDraftsStorageKey: 'test_session_drafts',
      sessionStreamsStorageKey: 'test_session_streams',
      sessionGoalsStorageKey: 'test_session_goals',
    }));

    await waitFor(() => {
      expect(result.current.sessionStreams['session-1']).toEqual([
        expect.objectContaining({
          id: 'evt-1',
          triggerEventId: 'evt-1',
        }),
      ]);
    });
  });

  it('normalizes cached artwork_capture user messages back into visible text messages', async () => {
    mockFetchSessions.mockResolvedValue([]);
    localStorage.setItem('test_session_streams', JSON.stringify({
      'session-1': [
        {
          id: 'evt-2',
          role: 'user',
          text: 'tell me about these artworks',
          type: 'artwork_capture',
          createdAt: 321,
        },
      ],
    }));

    const { result } = renderHook(() => useSessionState({
      userId: 'user-1',
      items: [],
      artworksLoaded: true,
      deleteConfirmation: null,
      defaultSessionTitle: 'Untitled Session',
      sessionDraftsStorageKey: 'test_session_drafts',
      sessionStreamsStorageKey: 'test_session_streams',
      sessionGoalsStorageKey: 'test_session_goals',
    }));

    await waitFor(() => {
      expect(result.current.sessionStreams['session-1']).toEqual([
        expect.objectContaining({
          id: 'evt-2',
          type: 'text',
          triggerEventId: 'evt-2',
        }),
      ]);
    });
  });
});
