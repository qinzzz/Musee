import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionActions } from './useSessionActions';
import type { GalleryItem, Visit } from '../../types';
import type { SessionRecord } from '../api/sessions';
import type { VisitDraft, VisitStreamMessage, VisitSummary } from '../types';

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

function createVisitSummary(overrides: Partial<VisitSummary> = {}): VisitSummary {
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
  visitSummaries?: VisitSummary[];
  persistedSessions?: SessionRecord[];
  editingVisitTitle?: string;
  isViewingSession?: (sessionId: string) => boolean;
};

function renderUseSessionActions(options: HarnessOptions = {}) {
  const showToast = vi.fn();
  const refreshPersistedSessions = vi.fn();
  const resetPreparedSessionState = vi.fn();
  const setItems = vi.fn();
  const setVisitDrafts = vi.fn();
  const setVisitStreams = vi.fn();
  const setStreamingVisitResponses = vi.fn();
  const setVisit = vi.fn();
  const setFilteredVisitId = vi.fn();
  const setPendingDeletedSessionIds = vi.fn();
  const setOpenVisitMenuId = vi.fn();
  const setDeleteConfirmation = vi.fn();
  const setEditingVisitId = vi.fn();
  const setEditingVisitTitle = vi.fn();
  const resetCurrentSessionView = vi.fn();

  const hook = renderHook(() => useSessionActions({
    defaultVisitTitle: 'Untitled Session',
    sessionUserId: 'user-1',
    visitSummaries: options.visitSummaries ?? [createVisitSummary()],
    persistedSessions: options.persistedSessions ?? [createPersistedSession()],
    editingVisitTitle: options.editingVisitTitle ?? 'Renamed Session',
    showToast,
    refreshPersistedSessions,
    resetPreparedSessionState,
    isViewingSession: options.isViewingSession ?? (() => false),
    setItems,
    setVisitDrafts,
    setVisitStreams,
    setStreamingVisitResponses,
    setVisit,
    setFilteredVisitId,
    setPendingDeletedSessionIds,
    setOpenVisitMenuId,
    setDeleteConfirmation,
    setEditingVisitId,
    setEditingVisitTitle,
    resetCurrentSessionView,
  }));

  return {
    ...hook,
    spies: {
      showToast,
      refreshPersistedSessions,
      resetPreparedSessionState,
      setItems,
      setVisitDrafts,
      setVisitStreams,
      setStreamingVisitResponses,
      setVisit,
      setFilteredVisitId,
      setPendingDeletedSessionIds,
      setOpenVisitMenuId,
      setDeleteConfirmation,
      setEditingVisitId,
      setEditingVisitTitle,
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
      visitSummaries: [createVisitSummary({ items: [] })],
      persistedSessions: [createPersistedSession()],
    });

    await act(async () => {
      await result.current.saveVisitTitle('session-1', 'Museum Visit');
    });

    expect(mockUpdateSession).toHaveBeenCalledWith('session-1', 'user-1', 'Museum Visit');
    expect(spies.refreshPersistedSessions).toHaveBeenCalledTimes(1);
    expect(spies.setItems).not.toHaveBeenCalled();
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
    expect(spies.setOpenVisitMenuId).toHaveBeenCalledWith(null);
    expect(spies.resetPreparedSessionState).toHaveBeenCalledTimes(1);
    expect(spies.resetCurrentSessionView).toHaveBeenCalledTimes(1);
    expect(mockDeleteSession).toHaveBeenCalledWith('session-1', 'user-1');
    expect(spies.refreshPersistedSessions).toHaveBeenCalledTimes(1);
    expect(spies.showToast).toHaveBeenCalledWith('Session deleted. Artworks stayed in your library.', 'success');
  });
});
