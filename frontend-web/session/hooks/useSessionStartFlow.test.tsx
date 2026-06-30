import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionStartFlow } from './useSessionStartFlow';
import type { ArtworkWorkspace, GalleryItem } from '../../types';
import type {
  PreparedSessionUploadEntry,
  PreparedUploadIngestResult,
  PreparedUploadSessionContext,
} from '../../artwork-ingest/types';
import type { PendingSessionArtwork } from '../types';

const {
  mockBuildPreparedSessionFallbackPrompt,
  mockStartSessionWithArtworks,
} = vi.hoisted(() => ({
  mockBuildPreparedSessionFallbackPrompt: vi.fn(),
  mockStartSessionWithArtworks: vi.fn(),
}));

vi.mock('../api/sessions', () => ({
  startSessionWithArtworks: mockStartSessionWithArtworks,
}));

vi.mock('../lib/preparedSession', () => ({
  buildPreparedSessionFallbackPrompt: mockBuildPreparedSessionFallbackPrompt,
}));

function createGalleryItem(overrides: Partial<GalleryItem> = {}): GalleryItem {
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
    timestamp: Date.now(),
    conversation: [],
    artistName: 'Unknown Artist',
    artworkName: 'Untitled',
    ...overrides,
  };
}

function createFile(name = 'upload.jpg', type = 'image/jpeg') {
  return new File(['upload'], name, { type });
}

type HarnessOptions = {
  pendingSessionArtworks?: PendingSessionArtwork[];
  newSessionDraftMessage?: string;
  ingestPreparedUploads?: (
    uploadEntries: PreparedSessionUploadEntry[],
    context: PreparedUploadSessionContext,
  ) => Promise<PreparedUploadIngestResult>;
};

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderUseSessionStartFlow(options: HarnessOptions = {}) {
  const refreshPersistedSessions = vi.fn();
  const setSessionDrafts = vi.fn();
  const setItems = vi.fn();
  const setActiveTab = vi.fn();
  const setFilteredSessionId = vi.fn();
  const setIsComposingNewSession = vi.fn();
  const setVisit = vi.fn();
  const resetPreparedSessionState = vi.fn();
  const appendSessionEvents = vi.fn();
  const persistSessionArtworkInput = vi.fn();
  const sendSessionInquiryToSession = vi.fn();
  const showToast = vi.fn();
  const ingestPreparedUploads = options.ingestPreparedUploads ?? vi.fn().mockResolvedValue({
    persistedItems: [],
    analysisPromise: Promise.resolve([]),
  });

  const hook = renderHook(() => {
    const [isSubmittingPreparedSession, setIsSubmittingPreparedSession] = React.useState(false);

    const api = useSessionStartFlow({
      defaultSessionTitle: 'Untitled Session',
      sessionUserId: 'user-1',
      pendingSessionArtworks: options.pendingSessionArtworks ?? [],
      newSessionDraftMessage: options.newSessionDraftMessage ?? '',
      isSubmittingPreparedSession,
      setIsSubmittingPreparedSession,
      refreshPersistedSessions,
      setSessionDrafts,
      setItems,
      setActiveTab,
      setFilteredSessionId,
      setIsComposingNewSession,
      setVisit,
      resetPreparedSessionState,
      appendSessionEvents,
      persistSessionArtworkInput,
      ingestPreparedUploads,
      sendSessionInquiryToSession,
      showToast,
    });

    return {
      api,
      state: {
        isSubmittingPreparedSession,
      },
    };
  });

  return {
    ...hook,
    spies: {
      refreshPersistedSessions,
      setSessionDrafts,
      setItems,
      setActiveTab,
      setFilteredSessionId,
      setIsComposingNewSession,
      setVisit,
      resetPreparedSessionState,
      appendSessionEvents,
      persistSessionArtworkInput,
      ingestPreparedUploads,
      sendSessionInquiryToSession,
      showToast,
    },
  };
}

describe('useSessionStartFlow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockStartSessionWithArtworks.mockResolvedValue({
      session: {
        id: 'session-1',
        title: 'Untitled Session',
      },
    });
    mockBuildPreparedSessionFallbackPrompt.mockReturnValue('fallback prompt');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('starts a persisted session from library artworks, ingests uploads, and sends the fallback prompt with resolved items', async () => {
    const libraryItem = createGalleryItem({ id: 'library-1', artworkId: 'artwork-library-1' });
    const uploadedResolvedItem = createGalleryItem({ id: 'upload-1', artworkId: 'artwork-upload-1' });

    const pendingSessionArtworks: PendingSessionArtwork[] = [
      {
        id: 'entry-library',
        kind: 'library',
        artwork: libraryItem,
        previewUrl: libraryItem.url,
        label: 'Artwork',
        sublabel: 'Library',
      },
      {
        id: 'entry-upload',
        kind: 'upload',
        file: createFile(),
        previewUrl: 'blob://upload',
        mode: 'gallery',
        timestamp: Date.now(),
        photoTime: 'Jun 23, 2026',
        label: 'Upload',
        sublabel: 'Gallery',
      },
    ];

    const ingestPreparedUploads = vi.fn().mockResolvedValue({
      persistedItems: [uploadedResolvedItem],
      analysisPromise: Promise.resolve([uploadedResolvedItem]),
    });
    const { result, spies } = renderUseSessionStartFlow({
      pendingSessionArtworks,
      ingestPreparedUploads,
    });

    await act(async () => {
      await result.current.api.submitPreparedSession();
    });

    expect(mockStartSessionWithArtworks).toHaveBeenCalledWith('user-1', {
      session_id: expect.stringMatching(/^session_/),
      title: 'Untitled Session',
      artwork_ids: ['artwork-library-1'],
    });
    expect(spies.ingestPreparedUploads).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          id: 'entry-upload',
          kind: 'upload',
        }),
      ],
      expect.objectContaining({
        sessionId: 'session-1',
        getSequenceNumber: expect.any(Function),
      }),
    );

    const ingestContext = spies.ingestPreparedUploads.mock.calls[0][1] as PreparedUploadSessionContext;
    expect(ingestContext.getSequenceNumber('entry-library')).toBe(0);
    expect(ingestContext.getSequenceNumber('entry-upload')).toBe(1);

    // Legacy capture/card events stay local-only (optimistic UI), not persisted.
    expect(spies.appendSessionEvents).toHaveBeenCalledWith(
      'session-1',
      expect.arrayContaining([
        expect.objectContaining({ type: 'artwork_capture', artworkId: 'artwork-library-1' }),
        expect.objectContaining({ type: 'artwork_card', artworkId: 'artwork-library-1' }),
      ]),
      { persist: false },
    );
    // The batch is persisted as one canonical user_input event with sources.
    expect(spies.persistSessionArtworkInput).toHaveBeenCalledWith(
      'session-1',
      expect.arrayContaining([
        expect.objectContaining({ artworkId: 'artwork-library-1', source: 'library' }),
        expect.objectContaining({ artworkId: 'artwork-upload-1', source: 'upload' }),
      ]),
      expect.stringMatching(/^evt-/),
      undefined,
    );
    expect(spies.setActiveTab).toHaveBeenCalledWith('newSession');
    expect(spies.setFilteredSessionId).toHaveBeenCalledWith('session-1');
    expect(spies.setIsComposingNewSession).toHaveBeenCalledWith(false);
    expect(spies.resetPreparedSessionState).toHaveBeenCalledTimes(1);

    act(() => {
      vi.runAllTimers();
    });

    expect(spies.sendSessionInquiryToSession).toHaveBeenCalledWith(
      'session-1',
      'fallback prompt',
      expect.arrayContaining([
        expect.objectContaining({ id: 'library-1' }),
        expect.objectContaining({ id: 'upload-1' }),
      ]),
      expect.objectContaining({
        persistUserMessage: false,
        parentEventIdOverride: expect.stringMatching(/^evt-/),
        // The local user_input event (artworks + opening text) is passed so the
        // commentary is stamped AFTER it; it's filtered out of the LLM prompt.
        historyOverride: [expect.objectContaining({ role: 'user' })],
      }),
    );
    expect(result.current.state.isSubmittingPreparedSession).toBe(false);
  });

  it('shows a toast and clears the submitting state when upload-only start produces no persisted artwork', async () => {

    const pendingSessionArtworks: PendingSessionArtwork[] = [
      {
        id: 'entry-upload',
        kind: 'upload',
        file: createFile(),
        previewUrl: 'blob://upload',
        mode: 'gallery',
        timestamp: Date.now(),
        photoTime: 'Jun 23, 2026',
        label: 'Upload',
        sublabel: 'Gallery',
      },
    ];

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result, spies } = renderUseSessionStartFlow({
      pendingSessionArtworks,
      ingestPreparedUploads: vi.fn().mockResolvedValue({
        persistedItems: [],
        analysisPromise: Promise.resolve([]),
      }),
    });

    await act(async () => {
      await result.current.api.submitPreparedSession();
    });

    expect(spies.showToast).toHaveBeenCalledWith('Couldn’t save the first artwork. Try again.', 'info');
    expect(spies.ingestPreparedUploads).toHaveBeenCalledTimes(1);
    expect(spies.setSessionDrafts).not.toHaveBeenCalled();
    expect(spies.resetPreparedSessionState).not.toHaveBeenCalled();
    expect(result.current.state.isSubmittingPreparedSession).toBe(false);

    consoleErrorSpy.mockRestore();
  });

  it('uses upload ingest as the first persisted commit when the draft only contains uploads', async () => {
    const uploadedResolvedItem = createGalleryItem({ id: 'upload-1', artworkId: 'artwork-upload-1' });
    const pendingSessionArtworks: PendingSessionArtwork[] = [
      {
        id: 'entry-upload',
        kind: 'upload',
        file: createFile(),
        previewUrl: 'blob://upload',
        mode: 'gallery',
        timestamp: Date.now(),
        photoTime: 'Jun 23, 2026',
        label: 'Upload',
        sublabel: 'Gallery',
      },
    ];

    const ingestPreparedUploads = vi.fn().mockResolvedValue({
      persistedItems: [uploadedResolvedItem],
      analysisPromise: Promise.resolve([uploadedResolvedItem]),
    });
    const { result, spies } = renderUseSessionStartFlow({
      pendingSessionArtworks,
      ingestPreparedUploads,
    });

    await act(async () => {
      await result.current.api.submitPreparedSession();
    });

    expect(mockStartSessionWithArtworks).not.toHaveBeenCalled();
    expect(spies.ingestPreparedUploads).toHaveBeenCalledWith(
      [expect.objectContaining({ id: 'entry-upload', kind: 'upload' })],
      expect.objectContaining({
        sessionId: expect.stringMatching(/^session_/),
        getSequenceNumber: expect.any(Function),
      }),
    );
    expect(spies.refreshPersistedSessions).toHaveBeenCalledTimes(1);
    expect(spies.setSessionDrafts).toHaveBeenCalled();
    expect(result.current.state.isSubmittingPreparedSession).toBe(false);
  });

  it('persists first-session text together with artwork batch and only echoes it locally', async () => {
    const libraryItem = createGalleryItem({ id: 'library-1', artworkId: 'artwork-library-1' });
    const pendingSessionArtworks: PendingSessionArtwork[] = [
      {
        id: 'entry-library',
        kind: 'library',
        artwork: libraryItem,
        previewUrl: libraryItem.url,
        label: 'Artwork',
        sublabel: 'Library',
      },
    ];

    const { result, spies } = renderUseSessionStartFlow({
      pendingSessionArtworks,
      newSessionDraftMessage: 'what are their similarities',
    });

    await act(async () => {
      await result.current.api.submitPreparedSession();
    });

    expect(spies.persistSessionArtworkInput).toHaveBeenCalledWith(
      'session-1',
      [expect.objectContaining({ artworkId: 'artwork-library-1', source: 'library' })],
      expect.stringMatching(/^evt-/),
      'what are their similarities',
    );

    act(() => {
      vi.runAllTimers();
    });

    expect(spies.sendSessionInquiryToSession).toHaveBeenCalledWith(
      'session-1',
      'what are their similarities',
      expect.arrayContaining([expect.objectContaining({ id: 'library-1' })]),
      expect.objectContaining({
        persistUserMessage: false,
        parentEventIdOverride: expect.stringMatching(/^evt-/),
        // The local user_input event (artworks + opening text) is passed so the
        // commentary is stamped AFTER it; it's filtered out of the LLM prompt.
        historyOverride: [expect.objectContaining({ role: 'user' })],
      }),
    );
  });

  it('enters the session before upload analysis finishes, then triggers commentary once analysis resolves', async () => {
    const uploadedPersistedItem = createGalleryItem({
      id: 'upload-persisted-1',
      artworkId: 'artwork-upload-1',
      sessionLinks: [{ sessionId: 'session_pending', sequenceNumber: 0, source: 'upload' }],
    });
    const uploadedAnalyzedItem = createGalleryItem({
      id: 'upload-persisted-1',
      artworkId: 'artwork-upload-1',
      artworkName: 'Analyzed Work',
      artistName: 'Analyzed Artist',
      sessionLinks: [{ sessionId: 'session_pending', sequenceNumber: 0, source: 'upload' }],
    });
    const analysisDeferred = createDeferred<GalleryItem[]>();
    const pendingSessionArtworks: PendingSessionArtwork[] = [
      {
        id: 'entry-upload',
        kind: 'upload',
        file: createFile(),
        previewUrl: 'blob://upload',
        mode: 'gallery',
        timestamp: Date.now(),
        photoTime: 'Jun 23, 2026',
        label: 'Upload',
        sublabel: 'Gallery',
      },
    ];

    const ingestPreparedUploads = vi.fn().mockResolvedValue({
      persistedItems: [uploadedPersistedItem],
      analysisPromise: analysisDeferred.promise,
    });

    const { result, spies } = renderUseSessionStartFlow({
      pendingSessionArtworks,
      newSessionDraftMessage: 'tell me about this piece',
      ingestPreparedUploads,
    });

    await act(async () => {
      await result.current.api.submitPreparedSession();
    });

    expect(spies.setActiveTab).toHaveBeenCalledWith('newSession');
    expect(spies.setFilteredSessionId).toHaveBeenCalledWith(expect.stringMatching(/^session_/));
    expect(spies.setSessionDrafts).toHaveBeenCalled();
    expect(spies.sendSessionInquiryToSession).not.toHaveBeenCalled();
    expect(result.current.state.isSubmittingPreparedSession).toBe(false);

    await act(async () => {
      analysisDeferred.resolve([uploadedAnalyzedItem]);
      await analysisDeferred.promise;
    });

    expect(spies.sendSessionInquiryToSession).toHaveBeenCalledWith(
      expect.stringMatching(/^session_/),
      'tell me about this piece',
      [expect.objectContaining({ id: 'upload-persisted-1', artworkName: 'Analyzed Work' })],
      expect.objectContaining({
        persistUserMessage: false,
        parentEventIdOverride: expect.stringMatching(/^evt-/),
        // The local user_input event (artworks + opening text) is passed so the
        // commentary is stamped AFTER it; it's filtered out of the LLM prompt.
        historyOverride: [expect.objectContaining({ role: 'user' })],
      }),
    );
  });
});
