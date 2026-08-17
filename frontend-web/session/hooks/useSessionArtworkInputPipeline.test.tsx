import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GalleryItem } from '../../types';
import type { PendingSessionArtwork, SessionStreamMessage } from '../types';
import { buildSessionRenderBlocks } from '../lib/sessionRenderBlocks';
import { SessionPolicyError } from '../api/sessions';
import { useSessionArtworkInputPipeline } from './useSessionArtworkInputPipeline';

const {
  mockAttachArtworksToSession,
  mockEnsureSession,
  mockBuildPreparedSessionFallbackPrompt,
  mockBuildStagedSessionAdditionPrompt,
} = vi.hoisted(() => ({
  mockAttachArtworksToSession: vi.fn(),
  mockEnsureSession: vi.fn(),
  mockBuildPreparedSessionFallbackPrompt: vi.fn(),
  mockBuildStagedSessionAdditionPrompt: vi.fn(),
}));

vi.mock('../api/sessions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/sessions')>()),
  attachArtworksToSession: mockAttachArtworksToSession,
  ensureSession: mockEnsureSession,
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
  persistedSessionIds?: string[];
  sessionTitleById?: Record<string, string>;
  newSessionDraftMessage?: string;
  onAuthenticationRequired?: ReturnType<typeof vi.fn>;
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
    const [sessionDrafts, setSessionDrafts] = React.useState<Array<{
      id: string;
      title: string;
      createdAt: number;
      updatedAt: number;
    }>>([]);
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
      persistedSessionIds: options.persistedSessionIds ?? ['session-1'],
      sessionTitleById: options.sessionTitleById ?? { 'session-1': 'Existing session' },
      sessionStreams,
      pendingSessionArtworks: options.pending,
      newSessionDraftMessage: options.newSessionDraftMessage ?? '',
      isSubmittingPreparedSession,
      setIsSubmittingPreparedSession,
      refreshPersistedSessions,
      setSessionDrafts,
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
      onAuthenticationRequired: options.onAuthenticationRequired,
    });

    return { api, sessionStreams, sessionDrafts };
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
    mockEnsureSession.mockImplementation(async (_userId, sessionId, title) => ({
      id: sessionId,
      user_id: 'user-1',
      title,
      title_source: 'user_locked',
      status: 'active',
      created_at: 100,
      updated_at: 100,
    }));
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

    expect(spies.resetPreparedSessionState).toHaveBeenCalled();

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

  it('keeps successful entries and adds an inline status for a partial upload failure', async () => {
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
        failedEntries: [{
          entryId: 'upload-1',
          message: 'Musee couldn’t upload this artwork. Check your connection and try again.',
          errorCode: 'server_error',
        }],
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
    expect(result.current.sessionStreams['session-1'][2]).toMatchObject({
      role: 'model',
      text: 'Couldn’t upload the artwork. Please try again.',
      payload: {
        message_kind: 'upload_failure',
        error_code: 'server_error',
      },
    });
    expect(spies.showToast).not.toHaveBeenCalled();
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

    const sessionId = mockEnsureSession.mock.calls[0][1];
    expect(sessionId).toMatch(/^session_/);
    expect(mockEnsureSession).toHaveBeenCalledWith('user-1', sessionId, 'Untitled Session');
    expect(mockAttachArtworksToSession).toHaveBeenCalledWith(
      sessionId,
      'user-1',
      ['library-artwork'],
    );
    expect(spies.persistSessionArtworkInput).toHaveBeenCalledWith(
      sessionId,
      [
        { artworkId: 'library-artwork', source: 'library' },
        { artworkId: 'uploaded-artwork', source: 'upload' },
      ],
      expect.stringMatching(/^evt-/),
      undefined,
    );
    expect(spies.sendSessionInquiryToSession).toHaveBeenCalledWith(
      sessionId,
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

  it('publishes a titled provisional session before persistence and waits to upload', async () => {
    const sessionSaved = createDeferred<{
      id: string;
      user_id: string;
      title: string;
      title_source: string;
      status: string;
      created_at: number;
      updated_at: number;
    }>();
    mockEnsureSession.mockImplementationOnce(() => sessionSaved.promise);
    const upload = createUploadEntry('upload-1');
    const persisted = createItem({ artworkId: 'saved-artwork-1' });
    const ingestPreparedUploads = vi.fn().mockResolvedValue({
      persistedItems: [persisted],
      persistedEntries: [{ entryId: upload.id, item: persisted }],
      failedEntries: [],
      analysisPromise: Promise.resolve([persisted]),
    });
    const { result } = renderPipeline({
      pending: [upload],
      ingestPreparedUploads,
      newSessionDraftMessage: '  What makes this painting feel quiet?  ',
    });

    let submission!: Promise<void>;
    act(() => {
      submission = result.current.api.submitPreparedSession();
    });

    await waitFor(() => expect(result.current.sessionDrafts).toHaveLength(1));
    const provisional = result.current.sessionDrafts[0];
    expect(provisional).toMatchObject({
      id: expect.stringMatching(/^session_/),
      title: 'What makes this painting feel quiet?',
    });
    expect(result.current.sessionStreams[provisional.id][0]).toMatchObject({
      role: 'user',
      text: 'What makes this painting feel quiet?',
    });
    expect(result.current.api.activeInputPipelineSessionId).toBe(provisional.id);
    expect(mockEnsureSession).toHaveBeenCalledWith(
      'user-1',
      provisional.id,
      'What makes this painting feel quiet?',
    );
    expect(ingestPreparedUploads).not.toHaveBeenCalled();

    await act(async () => {
      sessionSaved.resolve({
        id: provisional.id,
        user_id: 'user-1',
        title: provisional.title,
        title_source: 'user_locked',
        status: 'active',
        created_at: 100,
        updated_at: 100,
      });
      await submission;
    });

    expect(ingestPreparedUploads).toHaveBeenCalledWith(
      [upload],
      expect.objectContaining({ sessionId: provisional.id }),
    );
    expect(result.current.api.activeInputPipelineSessionId).toBeNull();
  });

  it('keeps the local session and shows an inline failure when persistence fails', async () => {
    mockEnsureSession.mockRejectedValueOnce(new Error('offline'));
    const upload = createUploadEntry('upload-1');
    const ingestPreparedUploads = vi.fn();
    const { result, spies } = renderPipeline({
      pending: [upload],
      ingestPreparedUploads,
      newSessionDraftMessage: 'A question for Musee',
    });

    await act(async () => {
      await result.current.api.submitPreparedSession();
    });

    expect(ingestPreparedUploads).not.toHaveBeenCalled();
    expect(result.current.sessionDrafts).toHaveLength(1);
    const sessionId = result.current.sessionDrafts[0].id;
    expect(result.current.sessionStreams[sessionId].at(-1)).toMatchObject({
      role: 'model',
      text: 'Couldn’t save this session',
      payload: {
        message_kind: 'session_failure',
        error_code: 'session_save_failed',
      },
    });
    expect(spies.persistSessionArtworkInput).not.toHaveBeenCalled();
    expect(spies.showToast).not.toHaveBeenCalled();
  });

  it('removes a rejected guest draft and opens sign-in when artwork-first creation reaches the quota', async () => {
    mockEnsureSession.mockRejectedValueOnce(new SessionPolicyError(
      'guest_quota_exhausted',
      'Guest preview used',
      true,
    ));
    const onAuthenticationRequired = vi.fn();
    const { result, spies } = renderPipeline({
      pending: [createUploadEntry('upload-1')],
      ingestPreparedUploads: vi.fn(),
      onAuthenticationRequired,
    });

    await act(async () => {
      await result.current.api.submitPreparedSession();
    });

    expect(result.current.sessionDrafts).toHaveLength(0);
    expect(result.current.sessionStreams).toEqual(expect.objectContaining({}));
    expect(spies.showToast).toHaveBeenCalledWith(
      'You’ve used your guest preview. Sign in to continue.',
      'info',
    );
    expect(onAuthenticationRequired).toHaveBeenCalledTimes(1);
  });

  it('opens sign-in when a stale client attempts a second guest artwork', async () => {
    const onAuthenticationRequired = vi.fn();
    const { result, spies } = renderPipeline({
      pending: [createUploadEntry('upload-2')],
      ingestPreparedUploads: vi.fn().mockResolvedValue({
        persistedItems: [],
        persistedEntries: [],
        failedEntries: [{
          entryId: 'upload-2',
          message: 'Guest artwork limit reached',
          errorCode: 'guest_quota_exhausted',
        }],
        analysisPromise: Promise.resolve([]),
      }),
      onAuthenticationRequired,
    });

    await act(async () => {
      await result.current.api.submitPreparedSession();
    });

    expect(spies.showToast).toHaveBeenCalledWith(
      'You’ve used your guest preview. Sign in to continue.',
      'info',
    );
    expect(onAuthenticationRequired).toHaveBeenCalledTimes(1);
  });

  it('ensures an unpersisted local session before retrying artwork input', async () => {
    const upload = createUploadEntry('upload-1');
    const persisted = createItem({ artworkId: 'saved-artwork-1' });
    const ingestPreparedUploads = vi.fn().mockResolvedValue({
      persistedItems: [persisted],
      persistedEntries: [{ entryId: upload.id, item: persisted }],
      failedEntries: [],
      analysisPromise: Promise.resolve([persisted]),
    });
    const { result } = renderPipeline({
      pending: [upload],
      ingestPreparedUploads,
      persistedSessionIds: [],
      sessionTitleById: { 'session-1': 'A local session' },
    });

    await act(async () => {
      await result.current.api.submitStagedBatch('session-1', 'Try once more');
    });

    expect(mockEnsureSession).toHaveBeenCalledWith('user-1', 'session-1', 'A local session');
    expect(ingestPreparedUploads).toHaveBeenCalledWith(
      [upload],
      expect.objectContaining({ sessionId: 'session-1' }),
    );
  });

  it('replaces the optimistic shell with an inline network failure when every upload fails', async () => {
    const upload = createUploadEntry('upload-1');
    const placeholder = createItem({ id: 'placeholder-1', artworkId: undefined });
    const ingestPreparedUploads = vi.fn(async (entries, context) => {
      context.onPlaceholdersReady?.([{ entryId: entries[0].id, item: placeholder }]);
      return {
        persistedItems: [],
        persistedEntries: [],
        failedEntries: [{
          entryId: entries[0].id,
          message: 'Musee couldn’t upload this artwork. Check your connection and try again.',
          errorCode: 'network_error',
        }],
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
    expect(result.current.sessionStreams['session-1']).toHaveLength(2);
    expect(result.current.sessionStreams['session-1'][0].id).toBe('existing-message');
    expect(result.current.sessionStreams['session-1'][1]).toMatchObject({
      role: 'model',
      text: 'Network error. Check your connection and try again.',
      payload: {
        message_kind: 'upload_failure',
        error_code: 'network_error',
      },
    });
    expect(result.current.api.isSubmittingStagedBatch).toBe(false);
    expect(spies.showToast).not.toHaveBeenCalled();

    const blocks = buildSessionRenderBlocks({
      id: 'session-1',
      title: 'Session',
      location: null,
      artworkCount: 0,
      updatedAt: 200,
      dateLabel: null,
      items: [],
    }, result.current.sessionStreams);
    expect(blocks.at(-1)).toMatchObject({
      type: 'status',
      message: 'Network error. Check your connection and try again.',
      tone: 'failed',
    });
  });

  it('adds a short inline status when analysis fails after upload persistence', async () => {
    const upload = createUploadEntry('upload-1');
    const placeholder = createItem({ id: 'placeholder-1', artworkId: undefined });
    const persisted = createItem({ ...placeholder, artworkId: 'saved-artwork-1' });
    const ingestPreparedUploads = vi.fn(async (entries, context) => {
      context.onPlaceholdersReady?.([{ entryId: entries[0].id, item: placeholder }]);
      return {
        persistedItems: [persisted],
        persistedEntries: [{ entryId: entries[0].id, item: persisted }],
        failedEntries: [],
        analysisPromise: Promise.resolve([]),
        analysisFailureCountPromise: Promise.resolve(1),
      };
    });
    const { result, spies } = renderPipeline({ pending: [upload], ingestPreparedUploads });

    await act(async () => {
      await result.current.api.submitStagedBatch('session-1', 'Question');
    });

    expect(result.current.sessionStreams['session-1'].at(-1)).toMatchObject({
      text: 'Analysis failed',
      payload: {
        message_kind: 'analysis_failure',
        error_code: 'analysis_failed',
      },
    });
    expect(spies.sendSessionInquiryToSession).not.toHaveBeenCalled();
    expect(spies.showToast).not.toHaveBeenCalled();
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

  it('rejects a synchronous duplicate submission before it can create another event', async () => {
    const uploadSaved = createDeferred<void>();
    const upload = createUploadEntry('upload-1');
    const placeholder = createItem({ id: 'placeholder-1', artworkId: undefined });
    const persisted = createItem({ ...placeholder, artworkId: 'saved-artwork-1' });
    const ingestPreparedUploads = vi.fn(async (entries, context) => {
      context.onPlaceholdersReady?.([{ entryId: entries[0].id, item: placeholder }]);
      await uploadSaved.promise;
      return {
        persistedItems: [persisted],
        persistedEntries: [{ entryId: entries[0].id, item: persisted }],
        failedEntries: [],
        analysisPromise: Promise.resolve([persisted]),
      };
    });
    const { result, spies } = renderPipeline({ pending: [upload], ingestPreparedUploads });

    let firstSubmission!: Promise<boolean>;
    let duplicateSubmission!: Promise<boolean>;
    act(() => {
      firstSubmission = result.current.api.submitStagedBatch('session-1', 'Question');
      duplicateSubmission = result.current.api.submitStagedBatch('session-1', 'Question');
    });

    await expect(duplicateSubmission).resolves.toBe(false);
    expect(ingestPreparedUploads).toHaveBeenCalledTimes(1);

    await act(async () => {
      uploadSaved.resolve();
      await firstSubmission;
    });
    expect(spies.persistSessionArtworkInput).toHaveBeenCalledTimes(1);
  });
});
