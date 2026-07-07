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
  editingSessionTitle?: string;
  isViewingSession?: (sessionId: string) => boolean;
  renamePersistedSession?: (sessionId: string, title: string) => Promise<void>;
};

function renderUseSessionActions(options: HarnessOptions = {}) {
  const showToast = vi.fn();
  const refreshPersistedSessions = vi.fn();
  const renamePersistedSession = vi.fn(options.renamePersistedSession ?? (async () => {}));
  const resetPreparedSessionState = vi.fn();
  const updateArtworkSessionLinks = vi.fn();
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
    editingSessionTitle: options.editingSessionTitle ?? 'Renamed Session',
    showToast,
    refreshPersistedSessions,
    renamePersistedSession,
    resetPreparedSessionState,
    isViewingSession: options.isViewingSession ?? (() => false),
    updateArtworkSessionLinks,
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
      renamePersistedSession,
      resetPreparedSessionState,
      updateArtworkSessionLinks,
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

  it('delegates persisted renames to the query-layer optimistic rename', async () => {
    const { result, spies } = renderUseSessionActions({
      sessionSummaries: [createSessionSummary({ items: [] })],
      persistedSessions: [createPersistedSession()],
    });

    await act(async () => {
      await result.current.saveSessionTitle('session-1', 'Museum Visit');
    });

    expect(spies.renamePersistedSession).toHaveBeenCalledWith('session-1', 'Museum Visit');
    // Drafts are pre-persist-only; persisted renames must not write one.
    expect(spies.setSessionDrafts).not.toHaveBeenCalled();
    expect(spies.updateArtworkSessionLinks).not.toHaveBeenCalled();
  });

  it('propagates a failed persisted rename without touching drafts', async () => {
    const { result, spies } = renderUseSessionActions({
      renamePersistedSession: async () => {
        throw new Error('rename failed');
      },
    });

    await act(async () => {
      await expect(result.current.saveSessionTitle('session-1', 'Museum Visit')).rejects.toThrow('rename failed');
    });

    expect(spies.setSessionDrafts).not.toHaveBeenCalled();
  });

  it('writes the title to a draft for not-yet-persisted sessions without calling the API', async () => {
    const { result, spies } = renderUseSessionActions({
      persistedSessions: [],
    });

    await act(async () => {
      await result.current.saveSessionTitle('session-1', 'Museum Visit');
    });

    expect(spies.renamePersistedSession).not.toHaveBeenCalled();
    expect(spies.setSessionDrafts).toHaveBeenCalledTimes(1);
    const updater = spies.setSessionDrafts.mock.calls[0][0] as Function;
    expect(updater([])).toEqual([
      expect.objectContaining({ id: 'session-1', title: 'Museum Visit' }),
    ]);
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
