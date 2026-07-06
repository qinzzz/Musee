import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionActions } from './useSessionActions';
import type { ArtworkWorkspace, GalleryItem } from '../../types';
import type { SessionRecord } from '../api/sessions';
import type { SessionSummary } from '../types';

const {
  mockDeleteSession,
  mockUpdateSession,
} = vi.hoisted(() => ({
  mockDeleteSession: vi.fn(),
  mockUpdateSession: vi.fn(),
}));

vi.mock('../api/sessions', () => ({
  deleteSession: mockDeleteSession,
  updateSession: mockUpdateSession,
}));

function createSessionSummary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: 'session-1',
    title: 'Old Title',
    location: null,
    artworkCount: 0,
    updatedAt: Date.now(),
    dateLabel: null,
    items: [],
    ...overrides,
  };
}

function createPersistedSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: 'session-1',
    user_id: 'user-1',
    title: 'Old Title',
    ...overrides,
  };
}

type HarnessOptions = {
  sessionSummaries?: SessionSummary[];
  persistedSessions?: SessionRecord[];
  sessionDrafts?: Array<{ id: string; title: string; createdAt: number; updatedAt: number }>;
  editingSessionTitle?: string;
  isViewingSession?: (sessionId: string) => boolean;
};

function renderUseSessionActions(options: HarnessOptions = {}) {
  const showToast = vi.fn();
  const refreshPersistedSessions = vi.fn();
  const resetPreparedSessionState = vi.fn();
  const setItems = vi.fn();
  const setSessionDrafts = vi.fn();
  const setSessionStreams = vi.fn();
  const setStreamingSessionResponses = vi.fn();
  const setVisit = vi.fn();
  const setFilteredSessionId = vi.fn();
  const setPendingDeletedSessionIds = vi.fn();
  const setOpenSessionMenuId = vi.fn();
  const setDeleteConfirmation = vi.fn();
  const setEditingSessionId = vi.fn();
  const setEditingSessionTitle = vi.fn();
  const resetCurrentSessionView = vi.fn();

  const hook = renderHook(() => useSessionActions({
    defaultSessionTitle: 'Untitled Session',
    sessionUserId: 'user-1',
    sessionSummaries: options.sessionSummaries ?? [createSessionSummary()],
    persistedSessions: options.persistedSessions ?? [createPersistedSession()],
    sessionDrafts: options.sessionDrafts ?? [],
    editingSessionTitle: options.editingSessionTitle ?? 'Renamed Session',
    showToast,
    refreshPersistedSessions,
    resetPreparedSessionState,
    isViewingSession: options.isViewingSession ?? (() => false),
    setItems,
    setSessionDrafts,
    setSessionStreams,
    setStreamingSessionResponses,
    setVisit,
    setFilteredSessionId,
    setPendingDeletedSessionIds,
    setOpenSessionMenuId,
    setDeleteConfirmation,
    setEditingSessionId,
    setEditingSessionTitle,
    resetCurrentSessionView,
  }));

  return {
    ...hook,
    spies: {
      showToast,
      refreshPersistedSessions,
      resetPreparedSessionState,
      setItems,
      setSessionDrafts,
      setSessionStreams,
      setStreamingSessionResponses,
      setVisit,
      setFilteredSessionId,
      setPendingDeletedSessionIds,
      setOpenSessionMenuId,
      setDeleteConfirmation,
      setEditingSessionId,
      setEditingSessionTitle,
      resetCurrentSessionView,
    },
  };
}

describe('useSessionActions', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.clearAllMocks();
  });

  it('persists renames for server-side sessions even when they have zero artworks', async () => {
    mockUpdateSession.mockResolvedValue({ ok: true });

    const { result, spies } = renderUseSessionActions({
      sessionSummaries: [createSessionSummary({ items: [] })],
      persistedSessions: [createPersistedSession()],
    });

    await act(async () => {
      await result.current.saveSessionTitle('session-1', 'Museum Visit');
    });

    expect(mockUpdateSession).toHaveBeenCalledWith('session-1', 'user-1', 'Museum Visit');
    expect(spies.refreshPersistedSessions).toHaveBeenCalledTimes(1);
    expect(spies.setItems).not.toHaveBeenCalled();
  });

  it('optimistically updates the local session title before persisted rename completes', async () => {
    let resolveRename!: (value: unknown) => void;
    mockUpdateSession.mockReturnValue(new Promise((resolve) => {
      resolveRename = resolve;
    }));

    const { result, spies } = renderUseSessionActions();

    const renamePromise = act(async () => {
      await result.current.saveSessionTitle('session-1', 'Museum Visit');
    });

    expect(spies.setSessionDrafts).toHaveBeenCalledTimes(1);
    expect(mockUpdateSession).toHaveBeenCalledWith('session-1', 'user-1', 'Museum Visit');
    expect(spies.refreshPersistedSessions).not.toHaveBeenCalled();

    const optimisticUpdater = spies.setSessionDrafts.mock.calls[0][0] as Function;
    expect(optimisticUpdater([])).toEqual([
      expect.objectContaining({ id: 'session-1', title: 'Museum Visit' }),
    ]);

    resolveRename({ ok: true });
    await renamePromise;

    expect(spies.refreshPersistedSessions).toHaveBeenCalledTimes(1);
  });

  it('rolls back an optimistic persisted rename when the API request fails', async () => {
    mockUpdateSession.mockRejectedValue(new Error('rename failed'));

    const previousDraft = {
      id: 'session-1',
      title: 'Previous Draft',
      createdAt: 10,
      updatedAt: 20,
    };
    const { result, spies } = renderUseSessionActions({
      sessionDrafts: [previousDraft],
    });

    await act(async () => {
      await expect(result.current.saveSessionTitle('session-1', 'Museum Visit')).rejects.toThrow('rename failed');
    });

    expect(spies.setSessionDrafts).toHaveBeenCalledTimes(2);
    const rollbackUpdater = spies.setSessionDrafts.mock.calls[1][0] as Function;
    expect(rollbackUpdater([{ ...previousDraft, title: 'Museum Visit', updatedAt: 30 }])).toEqual([previousDraft]);
    expect(spies.refreshPersistedSessions).not.toHaveBeenCalled();
  });

  it('resets the current session view before deleting the session being viewed', async () => {
    mockDeleteSession.mockResolvedValue({ ok: true });

    const { result, spies } = renderUseSessionActions({
      isViewingSession: (sessionId) => sessionId === 'session-1',
    });

    await act(async () => {
      await result.current.confirmDeleteSession('session-1');
    });

    expect(spies.setDeleteConfirmation).toHaveBeenCalledWith(null);
    expect(spies.setOpenSessionMenuId).toHaveBeenCalledWith(null);
    expect(spies.resetPreparedSessionState).toHaveBeenCalledTimes(1);
    expect(spies.resetCurrentSessionView).toHaveBeenCalledTimes(1);
    expect(mockDeleteSession).toHaveBeenCalledWith('session-1', 'user-1');
    expect(spies.refreshPersistedSessions).toHaveBeenCalledTimes(1);
    expect(spies.showToast).toHaveBeenCalledWith('Session deleted. Artworks stayed in your library.', 'success');
  });
});
