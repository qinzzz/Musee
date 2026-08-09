import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GalleryItem } from '../../types';
import type { PendingSessionArtwork, SessionStreamMessage } from '../types';
import { buildSessionRenderBlocks } from '../lib/sessionRenderBlocks';
import { useSessionArtworkInputPipeline } from './useSessionArtworkInputPipeline';

const {
  mockAttachArtworksToSession,
  mockStartSessionWithArtworks,
  mockBuildPreparedSessionFallbackPrompt,
  mockBuildStagedSessionAdditionPrompt,
} = vi.hoisted(() => ({
  mockAttachArtworksToSession: vi.fn(),
  mockStartSessionWithArtworks: vi.fn(),
  mockBuildPreparedSessionFallbackPrompt: vi.fn(),
  mockBuildStagedSessionAdditionPrompt: vi.fn(),
}));

vi.mock('../api/sessions', () => ({
  attachArtworksToSession: mockAttachArtworksToSession,
  startSessionWithArtworks: mockStartSessionWithArtworks,
}));

vi.mock('../lib/preparedSession', () => ({
  buildPreparedSessionFallbackPrompt: mockBuildPreparedSessionFallbackPrompt,
  buildStagedSessionAdditionPrompt: mockBuildStagedSessionAdditionPrompt,
}));

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function createItem(overrides: Partial<GalleryItem> = {}): GalleryItem {
  return {
    id: 'existing-client',
    artworkId: 'existing-artwork',
    url: 'https://example.com/art.jpg',
    keywords: [],
    vibe: {
      backgroundColor: '#fff',
      padding: 4,
      borderRadius: '12px',
      borderType: 'solid',
      accentColor: '#000',
    },
    timestamp: 100,
    sessionCapturedAt: 100,
    conversation: [],
    artistName: 'Artist',
    artworkName: 'Work',
    syncStatus: 'synced',
    ...overrides,
  };
}

const createUploadEntry = (id: string): Extract<PendingSessionArtwork, { kind: 'upload' }> => ({
  id,
  kind: 'upload',
  file: new File(['image'], `${id}.jpg`, { type: 'image/jpeg' }),
  previewUrl: `blob://${id}`,
  mode: 'gallery',
  timestamp: 200,
  photoTime: 'Aug 9, 2026',
  label: id,
  sublabel: 'Gallery',
});

function renderPipeline(options: {
  pending: PendingSessionArtwork[];
  items?: GalleryItem[];
  ingestPreparedUploads: ReturnType<typeof vi.fn>;
  persistSessionArtworkInput?: ReturnType<typeof vi.fn>;
}) {
  const persistSessionArtworkInput = options.persistSessionArtworkInput
    || vi.fn().mockResolvedValue(undefined);
  const sendSessionInquiryToSession = vi.fn();
  const refreshPersistedSessions = vi.fn();
  const resetPreparedSessionState = vi.fn();
  const showToast = vi.fn();

  const hook = renderHook(() => {
    const [sessionStreams, setSessionStreams] = React.useState<Record<string, SessionStreamMessage[]>>({
      'session-1': [{
        id: 'existing-message',
        role: 'model',
        text: 'Earlier response',
        sequenceNumber: 1,
        createdAt: 100,
      }],
    });
    const [isSubmittingPreparedSession, setIsSubmittingPreparedSession] = React.useState(false);
    const appendSessionEvents = (
      sessionId: string,
      messages: SessionStreamMessage[],
    ) => setSessionStreams((prev) => ({
      ...prev,
      [sessionId]: [...(prev[sessionId] || []), ...messages].reduce<SessionStreamMessage[]>((events, message) => {
        const existingIndex = events.findIndex((entry) => entry.id === message.id);
        if (existingIndex >= 0) events[existingIndex] = message;
        else events.push(message);
        return events;
      }, []),
    }));

    const api = useSessionArtworkInputPipeline({
      userId: 'user-1',
      defaultSessionTitle: 'Untitled Session',
      items: options.items || [],
      sessionStreams,
      pendingSessionArtworks: options.pending,
      newSessionDraftMessage: '',
      isSubmittingPreparedSession,
      setIsSubmittingPreparedSession,
      refreshPersistedSessions,
      setSessionDrafts: vi.fn(),
      updateArtworkSessionLinks: vi.fn(),
      setActiveTab: vi.fn(),
      setFilteredSessionId: vi.fn(),
      setIsComposingNewSession: vi.fn(),
      setVisit: vi.fn(),
      setSessionStreams,
      resetPreparedSessionState,
      appendSessionEvents,
      persistSessionArtworkInput,
      ingestPreparedUploads: options.ingestPreparedUploads,
      sendSessionInquiryToSession,
      showToast,
    });

    return { api, sessionStreams };
  });

  return {
    ...hook,
    spies: {
      persistSessionArtworkInput,
      sendSessionInquiryToSession,
      refreshPersistedSessions,
      resetPreparedSessionState,
      showToast,
    },
  };
}

describe('useSessionArtworkInputPipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAttachArtworksToSession.mockResolvedValue({ inserted: 0, artworks: [] });
    mockStartSessionWithArtworks.mockResolvedValue({
      session: { id: 'session-new', title: 'Untitled Session' },
    });
    mockBuildPreparedSessionFallbackPrompt.mockReturnValue('Discuss these artworks');
    mockBuildStagedSessionAdditionPrompt.mockReturnValue('Discuss the additions');
  });

  it('binds upload placeholders to one stable optimistic event before they can render', async () => {
    const uploadSaved = createDeferred<void>();
    const analysisFinished = createDeferred<GalleryItem[]>();
    const placeholder = createItem({
      id: 'placeholder-1',
      artworkId: undefined,
      url: 'blob://upload-1',
      isAnalyzing: true,
      analysisStatus: 'pending',
      sessionLinks: [{ sessionId: 'session-1', sequenceNumber: 0, source: 'upload' }],
    });
    const persisted = createItem({
      ...placeholder,
      artworkId: 'saved-artwork-1',
      syncStatus: 'synced',
    });
    const ingestPreparedUploads = vi.fn(async (entries, context) => {
      context.onPlaceholdersReady?.([{ entryId: entries[0].id, item: placeholder }]);
      await uploadSaved.promise;
      return {
        persistedItems: [persisted],
        persistedEntries: [{ entryId: entries[0].id, item: persisted }],
        failedEntries: [],
        analysisPromise: analysisFinished.promise,
      };
    });
    const { result, spies } = renderPipeline({
      pending: [createUploadEntry('upload-1')],
      ingestPreparedUploads,
    });

    let submission!: Promise<boolean>;
    act(() => {
      submission = result.current.api.submitStagedBatch('session-1', 'What do you see?');
    });

    await waitFor(() => {
      const optimistic = result.current.sessionStreams['session-1'][1];
      expect(optimistic.artworkIds).toEqual(['placeholder-1']);
    });

    const optimisticBeforePersistence = result.current.sessionStreams['session-1'][1];
    const blocks = buildSessionRenderBlocks({
      id: 'session-1',
      title: 'Session',
      titlePending: false,
      location: null,
      artworkCount: 1,
      updatedAt: 200,
      dateLabel: null,
      items: [placeholder],
    }, result.current.sessionStreams, { allItems: [placeholder] });

    expect(blocks.map((block) => block.id)).toEqual(['existing-message', optimisticBeforePersistence.id]);
    expect(blocks[1].type).toBe('input');

    act(() => {
      uploadSaved.resolve();
    });
    await waitFor(() => expect(spies.persistSessionArtworkInput).toHaveBeenCalled());

    const optimisticAfterPersistence = result.current.sessionStreams['session-1'][1];
    expect(optimisticAfterPersistence).toMatchObject({
      id: optimisticBeforePersistence.id,
      localOrder: optimisticBeforePersistence.localOrder,
      createdAt: optimisticBeforePersistence.createdAt,
      artworkIds: ['saved-artwork-1'],
    });

    await act(async () => {
      analysisFinished.resolve([persisted]);
      await submission;
    });
    expect(spies.sendSessionInquiryToSession).toHaveBeenCalledTimes(1);
  });

  it('removes failed uploads from the canonical event while preserving successful entries', async () => {
    const entries = [createUploadEntry('upload-1'), createUploadEntry('upload-2')];
    const placeholders = entries.map((entry, index) => createItem({
      id: `placeholder-${index + 1}`,
      artworkId: undefined,
      sessionLinks: [{ sessionId: 'session-1', sequenceNumber: index, source: 'upload' }],
    }));
    const persisted = createItem({
      ...placeholders[1],
      artworkId: 'saved-artwork-2',
      syncStatus: 'synced',
    });
    const ingestPreparedUploads = vi.fn(async (_entries, context) => {
      context.onPlaceholdersReady?.(entries.map((entry, index) => ({
        entryId: entry.id,
        item: placeholders[index],
      })));
      return {
        persistedItems: [persisted],
        persistedEntries: [{ entryId: 'upload-2', item: persisted }],
        failedEntries: [{ entryId: 'upload-1', message: 'Musee couldn’t upload this artwork. Check your connection and try again.' }],
        analysisPromise: Promise.resolve([persisted]),
      };
    });
    const { result, spies } = renderPipeline({ pending: entries, ingestPreparedUploads });

    await act(async () => {
      await result.current.api.submitStagedBatch('session-1', 'Compare them');
    });

    expect(spies.persistSessionArtworkInput).toHaveBeenCalledWith(
      'session-1',
      [{ artworkId: 'saved-artwork-2', source: 'upload' }],
      expect.stringMatching(/^evt-/),
      'Compare them',
    );
    expect(result.current.sessionStreams['session-1'][1].artworkIds).toEqual(['saved-artwork-2']);
    expect(spies.showToast).toHaveBeenCalledWith(
      'Musee couldn’t upload this artwork. Check your connection and try again. The other selected artworks were added.',
      'info',
    );
  });

  it('uses the same canonical event for a new session with library and uploaded artwork', async () => {
    const libraryItem = createItem({
      id: 'library-client',
      artworkId: 'library-artwork',
    });
    const upload = createUploadEntry('upload-1');
    const placeholder = createItem({
      id: 'placeholder-1',
      artworkId: undefined,
      sessionLinks: [{ sessionId: 'session-new', sequenceNumber: 1, source: 'upload' }],
    });
    const persisted = createItem({
      ...placeholder,
      artworkId: 'uploaded-artwork',
      syncStatus: 'synced',
    });
    const ingestPreparedUploads = vi.fn(async (entries, context) => {
      context.onPlaceholdersReady?.([{ entryId: entries[0].id, item: placeholder }]);
      return {
        persistedItems: [persisted],
        persistedEntries: [{ entryId: entries[0].id, item: persisted }],
        failedEntries: [],
        analysisPromise: Promise.resolve([persisted]),
      };
    });
    const { result, spies } = renderPipeline({
      pending: [
        {
          id: 'library-entry',
          kind: 'library',
          artwork: libraryItem,
          previewUrl: libraryItem.url,
          label: 'Library work',
          sublabel: 'Collection',
        },
        upload,
      ],
      items: [libraryItem],
      ingestPreparedUploads,
    });

    await act(async () => {
      await result.current.api.submitPreparedSession();
    });

    expect(mockStartSessionWithArtworks).toHaveBeenCalledWith('user-1', {
      session_id: expect.stringMatching(/^session_/),
      title: 'Untitled Session',
      artwork_ids: ['library-artwork'],
    });
    expect(spies.persistSessionArtworkInput).toHaveBeenCalledWith(
      'session-new',
      [
        { artworkId: 'library-artwork', source: 'library' },
        { artworkId: 'uploaded-artwork', source: 'upload' },
      ],
      expect.stringMatching(/^evt-/),
      undefined,
    );
    expect(spies.sendSessionInquiryToSession).toHaveBeenCalledWith(
      'session-new',
      'Discuss these artworks',
      expect.arrayContaining([
        expect.objectContaining({ artworkId: 'library-artwork' }),
        expect.objectContaining({ artworkId: 'uploaded-artwork' }),
      ]),
      expect.objectContaining({
        persistUserMessage: false,
        parentEventIdOverride: expect.stringMatching(/^evt-/),
      }),
    );
  });

  it('removes the optimistic shell when every upload fails', async () => {
    const upload = createUploadEntry('upload-1');
    const placeholder = createItem({ id: 'placeholder-1', artworkId: undefined });
    const ingestPreparedUploads = vi.fn(async (entries, context) => {
      context.onPlaceholdersReady?.([{ entryId: entries[0].id, item: placeholder }]);
      return {
        persistedItems: [],
        persistedEntries: [],
        failedEntries: [{ entryId: entries[0].id, message: 'Musee couldn’t upload this artwork. Check your connection and try again.' }],
        analysisPromise: Promise.resolve([]),
      };
    });
    const { result, spies } = renderPipeline({ pending: [upload], ingestPreparedUploads });

    let succeeded = true;
    await act(async () => {
      succeeded = await result.current.api.submitStagedBatch('session-1', 'Question');
    });

    expect(succeeded).toBe(false);
    expect(spies.persistSessionArtworkInput).not.toHaveBeenCalled();
    expect(result.current.sessionStreams['session-1']).toHaveLength(1);
    expect(result.current.sessionStreams['session-1'][0].id).toBe('existing-message');
    expect(spies.showToast).toHaveBeenCalledWith(
      'Musee couldn’t upload this artwork. Check your connection and try again.',
      'info',
    );
  });

  it('retries canonical event persistence once with the same id', async () => {
    const upload = createUploadEntry('upload-1');
    const placeholder = createItem({ id: 'placeholder-1', artworkId: undefined });
    const persisted = createItem({ ...placeholder, artworkId: 'saved-artwork-1' });
    const persistSessionArtworkInput = vi.fn()
      .mockRejectedValueOnce(new Error('temporary network error'))
      .mockResolvedValueOnce(undefined);
    const ingestPreparedUploads = vi.fn(async (entries, context) => {
      context.onPlaceholdersReady?.([{ entryId: entries[0].id, item: placeholder }]);
      return {
        persistedItems: [persisted],
        persistedEntries: [{ entryId: entries[0].id, item: persisted }],
        failedEntries: [],
        analysisPromise: Promise.resolve([persisted]),
      };
    });
    const { result } = renderPipeline({
      pending: [upload],
      ingestPreparedUploads,
      persistSessionArtworkInput,
    });

    await act(async () => {
      await result.current.api.submitStagedBatch('session-1', 'Question');
    });

    expect(persistSessionArtworkInput).toHaveBeenCalledTimes(2);
    expect(persistSessionArtworkInput.mock.calls[0]).toEqual(persistSessionArtworkInput.mock.calls[1]);
  });
});
