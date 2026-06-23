import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionStartFlow } from './useSessionStartFlow';
import type { GalleryItem, Visit } from '../../types';
import type { PreparedSessionUploadEntry, PreparedUploadSessionContext } from '../../artwork-ingest/types';
import type { PendingSessionArtwork, VisitDraft, VisitStreamMessage } from '../types';

const {
  mockAttachArtworksToSession,
  mockBuildPreparedSessionFallbackPrompt,
  mockCreateSession,
} = vi.hoisted(() => ({
  mockAttachArtworksToSession: vi.fn(),
  mockBuildPreparedSessionFallbackPrompt: vi.fn(),
  mockCreateSession: vi.fn(),
}));

vi.mock('../api/sessions', () => ({
  attachArtworksToSession: mockAttachArtworksToSession,
  createSession: mockCreateSession,
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
  ) => Promise<GalleryItem[]>;
};

function renderUseSessionStartFlow(options: HarnessOptions = {}) {
  const refreshPersistedSessions = vi.fn();
  const setVisitDrafts = vi.fn();
  const setItems = vi.fn();
  const setActiveTab = vi.fn();
  const setFilteredVisitId = vi.fn();
  const setIsComposingNewSession = vi.fn();
  const setVisit = vi.fn();
  const resetPreparedSessionState = vi.fn();
  const appendVisitMessages = vi.fn();
  const sendVisitInquiryToSession = vi.fn();
  const showToast = vi.fn();
  const ingestPreparedUploads = options.ingestPreparedUploads ?? vi.fn().mockResolvedValue([]);

  const hook = renderHook(() => {
    const [isSubmittingPreparedSession, setIsSubmittingPreparedSession] = React.useState(false);

    const api = useSessionStartFlow({
      defaultVisitTitle: 'Untitled Session',
      sessionUserId: 'user-1',
      pendingSessionArtworks: options.pendingSessionArtworks ?? [],
      newSessionDraftMessage: options.newSessionDraftMessage ?? '',
      isSubmittingPreparedSession,
      setIsSubmittingPreparedSession,
      refreshPersistedSessions,
      setVisitDrafts,
      setItems,
      setActiveTab,
      setFilteredVisitId,
      setIsComposingNewSession,
      setVisit,
      resetPreparedSessionState,
      appendVisitMessages,
      ingestPreparedUploads,
      sendVisitInquiryToSession,
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
      setVisitDrafts,
      setItems,
      setActiveTab,
      setFilteredVisitId,
      setIsComposingNewSession,
      setVisit,
      resetPreparedSessionState,
      appendVisitMessages,
      ingestPreparedUploads,
      sendVisitInquiryToSession,
      showToast,
    },
  };
}

describe('useSessionStartFlow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockCreateSession.mockResolvedValue({
      session: {
        id: 'session-1',
        title: 'Untitled Session',
      },
    });
    mockAttachArtworksToSession.mockResolvedValue({ inserted: 1, artworks: [] });
    mockBuildPreparedSessionFallbackPrompt.mockReturnValue('fallback prompt');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('creates a session, ingests uploads, and sends the fallback prompt with resolved items', async () => {
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

    const ingestPreparedUploads = vi.fn().mockResolvedValue([uploadedResolvedItem]);
    const { result, spies } = renderUseSessionStartFlow({
      pendingSessionArtworks,
      ingestPreparedUploads,
    });

    await act(async () => {
      await result.current.api.submitPreparedSession();
    });

    expect(mockCreateSession).toHaveBeenCalledWith('user-1', undefined, 'Untitled Session');
    expect(mockAttachArtworksToSession).toHaveBeenCalledWith('session-1', 'user-1', ['artwork-library-1']);
    expect(spies.ingestPreparedUploads).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          id: 'entry-upload',
          kind: 'upload',
        }),
      ],
      expect.objectContaining({
        sessionId: 'session-1',
        sessionTitle: 'Untitled Session',
        getSequenceNumber: expect.any(Function),
      }),
    );

    const ingestContext = spies.ingestPreparedUploads.mock.calls[0][1] as PreparedUploadSessionContext;
    expect(ingestContext.getSequenceNumber('entry-library')).toBe(0);
    expect(ingestContext.getSequenceNumber('entry-upload')).toBe(1);

    expect(spies.appendVisitMessages).toHaveBeenCalledWith(
      'session-1',
      expect.arrayContaining([
        expect.objectContaining({ type: 'artwork_capture', artworkId: 'artwork-library-1' }),
        expect.objectContaining({ type: 'artwork_card', artworkId: 'artwork-library-1' }),
      ]),
    );
    expect(spies.setActiveTab).toHaveBeenCalledWith('newSession');
    expect(spies.setFilteredVisitId).toHaveBeenCalledWith('session-1');
    expect(spies.setIsComposingNewSession).toHaveBeenCalledWith(false);
    expect(spies.resetPreparedSessionState).toHaveBeenCalledTimes(1);

    act(() => {
      vi.runAllTimers();
    });

    expect(spies.sendVisitInquiryToSession).toHaveBeenCalledWith(
      'session-1',
      'fallback prompt',
      expect.arrayContaining([
        expect.objectContaining({ id: 'library-1' }),
        expect.objectContaining({ id: 'upload-1' }),
      ]),
      { persistUserMessage: false },
    );
    expect(result.current.state.isSubmittingPreparedSession).toBe(false);
  });

  it('shows a toast and clears the submitting state when session creation fails', async () => {
    mockCreateSession.mockRejectedValue(new Error('network down'));

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
    });

    await act(async () => {
      await result.current.api.submitPreparedSession();
    });

    expect(spies.showToast).toHaveBeenCalledWith('Could not start session from selected artworks.', 'info');
    expect(spies.ingestPreparedUploads).not.toHaveBeenCalled();
    expect(result.current.state.isSubmittingPreparedSession).toBe(false);

    consoleErrorSpy.mockRestore();
  });
});
