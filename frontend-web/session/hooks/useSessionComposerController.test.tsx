import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GalleryItem } from '../../types';
import { useSessionComposerController } from './useSessionComposerController';

const { mockUseSessionArtworkInputPipeline, pipeline } = vi.hoisted(() => ({
  mockUseSessionArtworkInputPipeline: vi.fn(),
  pipeline: {
    isSubmittingStagedBatch: false,
    activeInputPipelineSessionId: null,
    submitPreparedSession: vi.fn(),
    submitStagedBatch: vi.fn(),
    submitImmediateArtwork: vi.fn(),
  },
}));

vi.mock('./useSessionArtworkInputPipeline', () => ({
  useSessionArtworkInputPipeline: mockUseSessionArtworkInputPipeline,
}));

function createItem(overrides: Partial<GalleryItem> = {}): GalleryItem {
  return {
    id: 'item-1',
    artworkId: 'artwork-1',
    url: 'https://example.com/art.jpg',
    keywords: [],
    vibe: {
      backgroundColor: '#fff',
      padding: 4,
      borderRadius: '12px',
      borderType: 'solid',
      accentColor: '#000',
    },
    timestamp: 1,
    conversation: [],
    ...overrides,
  };
}

function createWorkspace(activeSessionId: string | null = 'session-1') {
  const prepared = {
    pendingSessionArtworks: [],
    setPendingSessionArtworks: vi.fn(),
    newSessionDraftMessage: '',
    setNewSessionDraftMessage: vi.fn(),
    isLibraryPickerOpen: false,
    setIsLibraryPickerOpen: vi.fn(),
    libraryPickerSearch: '',
    setLibraryPickerSearch: vi.fn(),
    isSubmittingPreparedSession: false,
    setIsSubmittingPreparedSession: vi.fn(),
    pendingLibraryArtworkIds: [],
    availableLibraryArtworks: [],
    resetPreparedSessionState: vi.fn(),
    commitLibrarySelection: vi.fn(),
    removePendingSessionArtwork: vi.fn(),
  };
  const sessionState = {
    activeSessionSummary: activeSessionId ? { id: activeSessionId, title: 'Session' } : null,
    isComposingNewSession: activeSessionId === null,
    persistedSessions: activeSessionId ? [{ id: activeSessionId }] : [],
    sessionSummaries: activeSessionId ? [{ id: activeSessionId, title: 'Session' }] : [],
    sessionStreams: {},
    refreshPersistedSessions: vi.fn(),
    setSessionDrafts: vi.fn(),
    setFilteredSessionId: vi.fn(),
    setIsComposingNewSession: vi.fn(),
    setSessionStreams: vi.fn(),
  };
  const messaging = {
    appendSessionEvents: vi.fn(),
    persistSessionArtworkInput: vi.fn(),
    sendSessionInquiryToSession: vi.fn(),
  };
  return {
    workspace: { sessionState, prepared, messaging } as unknown as Parameters<typeof useSessionComposerController>[0]['workspace'],
    prepared,
    sessionState,
    messaging,
  };
}

function createHarness(options: { activeSessionId?: string | null; canSearchCollection?: boolean } = {}) {
  const workspace = createWorkspace(options.activeSessionId === undefined ? 'session-1' : options.activeSessionId);
  const prepareCaptureSubmission = vi.fn();
  const exitCaptureAfterSubmit = vi.fn();
  const onAuthenticationRequired = vi.fn();
  const hookOptions: Parameters<typeof useSessionComposerController>[0] = {
    userId: 'user-1',
    defaultSessionTitle: 'Untitled Session',
    items: [createItem()],
    canSearchCollection: options.canSearchCollection ?? true,
    workspace: workspace.workspace,
    ingestPreparedUploads: vi.fn(),
    prepareCaptureSubmission,
    handleFileUpload: vi.fn(),
    updateArtworkSessionLinks: vi.fn(),
    setActiveTab: vi.fn(),
    setVisit: vi.fn(),
    exitCaptureAfterSubmit,
    showToast: vi.fn(),
    onAuthenticationRequired,
  };
  const hook = renderHook((props: typeof hookOptions) => useSessionComposerController(props), {
    initialProps: hookOptions,
  });
  return {
    ...hook,
    hookOptions,
    prepareCaptureSubmission,
    exitCaptureAfterSubmit,
    onAuthenticationRequired,
    ...workspace,
  };
}

describe('useSessionComposerController', () => {
  beforeEach(() => {
    mockUseSessionArtworkInputPipeline.mockReturnValue(pipeline);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('wires the existing input pipeline from workspace state and messaging actions', () => {
    const harness = createHarness();

    expect(mockUseSessionArtworkInputPipeline).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      persistedSessionIds: ['session-1'],
      sessionTitleById: { 'session-1': 'Session' },
      sessionStreams: harness.sessionState.sessionStreams,
      resetPreparedSessionState: harness.prepared.resetPreparedSessionState,
      appendSessionEvents: harness.messaging.appendSessionEvents,
    }));
  });

  it('opens the active-session library picker only when collection access is allowed', () => {
    const allowed = createHarness();
    act(() => allowed.result.current.openSessionLibraryPicker());

    expect(allowed.result.current.libraryPickerSessionId).toBe('session-1');
    expect(allowed.prepared.setIsLibraryPickerOpen).toHaveBeenCalledWith(true);

    const restricted = createHarness({ canSearchCollection: false });
    act(() => restricted.result.current.openSessionLibraryPicker());

    expect(restricted.onAuthenticationRequired).toHaveBeenCalledTimes(1);
    expect(restricted.prepared.setIsLibraryPickerOpen).not.toHaveBeenCalledWith(true);
  });

  it('commits or closes the picker through one cleanup path', () => {
    const harness = createHarness();
    const selected = [createItem()];

    act(() => harness.result.current.confirmLibrarySelection(selected));

    expect(harness.prepared.commitLibrarySelection).toHaveBeenCalledWith(selected);
    expect(harness.prepared.setIsLibraryPickerOpen).toHaveBeenCalledWith(false);
    expect(harness.prepared.setLibraryPickerSearch).toHaveBeenCalledWith('');
    expect(harness.result.current.libraryPickerSessionId).toBeNull();
  });

  it('resets staged input only when the composition surface changes', async () => {
    const harness = createHarness();
    await waitFor(() => expect(harness.prepared.resetPreparedSessionState).toHaveBeenCalledTimes(1));

    harness.rerender({ ...harness.hookOptions });
    expect(harness.prepared.resetPreparedSessionState).toHaveBeenCalledTimes(1);

    const nextWorkspace = createWorkspace('session-2');
    harness.rerender({ ...harness.hookOptions, workspace: nextWorkspace.workspace });
    await waitFor(() => expect(nextWorkspace.prepared.resetPreparedSessionState).toHaveBeenCalledTimes(1));
  });

  it('prepares capture, exits capture mode, and submits to the active session', async () => {
    const harness = createHarness();
    const payload = { artwork: new File(['art'], 'art.jpg'), label: null };
    const preparedCapture = { id: 'upload-1', kind: 'upload' };
    harness.prepareCaptureSubmission.mockResolvedValue(preparedCapture);
    pipeline.submitImmediateArtwork.mockResolvedValue(true);

    await act(async () => {
      await harness.result.current.handleSessionCaptureSubmit(payload);
    });

    expect(harness.prepareCaptureSubmission).toHaveBeenCalledWith(payload);
    expect(harness.exitCaptureAfterSubmit).toHaveBeenCalledTimes(1);
    expect(pipeline.submitImmediateArtwork).toHaveBeenCalledWith(preparedCapture, 'session-1');
  });
});
