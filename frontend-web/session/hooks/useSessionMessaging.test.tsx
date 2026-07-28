import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionMessaging } from './useSessionMessaging';
import type { ArtworkWorkspace, GalleryItem } from '../../types';
import type { SessionStreamMessage, SessionSummary } from '../types';

const {
  mockAppendSessionMessages,
  mockCreateSession,
  mockStartSessionWithEvent,
  mockStreamSessionChat,
  mockUpdateSessionEvent,
} = vi.hoisted(() => ({
  mockAppendSessionMessages: vi.fn(),
  mockCreateSession: vi.fn(),
  mockStartSessionWithEvent: vi.fn(),
  mockStreamSessionChat: vi.fn(),
  mockUpdateSessionEvent: vi.fn(),
}));

vi.mock('../api/sessions', () => ({
  appendSessionEvents: mockAppendSessionMessages,
  createSession: mockCreateSession,
  startSessionWithEvent: mockStartSessionWithEvent,
  updateSessionEvent: mockUpdateSessionEvent,
}));

vi.mock('../../api/chat', () => ({
  streamSessionChat: mockStreamSessionChat,
}));

function createSessionSummary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: 'visit-1',
    title: 'Untitled Session',
    location: null,
    artworkCount: 0,
    updatedAt: Date.now(),
    dateLabel: null,
    items: [],
    ...overrides,
  };
}

function renderUseSessionMessaging(options: {
  activeSessionSummary?: SessionSummary | null;
  filteredSessionId?: string | null;
  isComposingNewSession?: boolean;
  sessionSummaries?: SessionSummary[];
  sessionStreams?: Record<string, SessionStreamMessage[]>;
  streamingSessionResponses?: Record<string, string>;
  items?: GalleryItem[];
} = {}) {
  const refreshPersistedSessions = vi.fn();
  const setSessionDrafts = vi.fn();
  const setFilteredSessionId = vi.fn();
  const setIsComposingNewSession = vi.fn();
  const setVisit = vi.fn();
  const setSessionStreams = vi.fn();
  const setStreamingSessionResponses = vi.fn();
  const showToast = vi.fn();

  const hook = renderHook(() => useSessionMessaging({
    defaultSessionTitle: 'Untitled Session',
    sessionUserId: 'user-1',
    filteredSessionId: options.filteredSessionId ?? null,
    isComposingNewSession: options.isComposingNewSession ?? true,
    items: options.items ?? [] as GalleryItem[],
    sessionStreams: options.sessionStreams ?? {},
    streamingSessionResponses: options.streamingSessionResponses ?? {},
    sessionGoals: {},
    sessionSummaries: options.sessionSummaries ?? [],
    activeSessionSummary: options.activeSessionSummary ?? null,
    refreshPersistedSessions,
    setSessionDrafts,
    setFilteredSessionId,
    setIsComposingNewSession,
    setVisit,
    setSessionStreams,
    setStreamingSessionResponses,
    showToast,
  }));

  return {
    ...hook,
    spies: {
      refreshPersistedSessions,
      setSessionDrafts,
      setFilteredSessionId,
      setIsComposingNewSession,
      setVisit,
      setSessionStreams,
      setStreamingSessionResponses,
      showToast,
    },
  };
}

describe('useSessionMessaging', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockAppendSessionMessages.mockResolvedValue(undefined);
    mockCreateSession.mockResolvedValue({ session: { id: 'session-1' } });
    mockStartSessionWithEvent.mockResolvedValue({ inserted: 1, session: { id: 'session-1', title: 'Untitled Session' } });
    mockUpdateSessionEvent.mockResolvedValue({});
    mockStreamSessionChat.mockImplementation((
      _items: GalleryItem[],
      _history: SessionStreamMessage[],
      _text: string,
      _onChunk: (chunk: string) => void,
      onComplete: (fullResponse: string) => void,
    ) => {
      onComplete('assistant reply');
    });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.clearAllMocks();
  });

  it('creates and commits the first user message atomically before streaming the assistant reply', async () => {
    const { result, spies } = renderUseSessionMessaging();
    let didSubmit = false;

    await act(async () => {
      didSubmit = await result.current.handleSessionInquiry('Hello there');
    });

    expect(didSubmit).toBe(true);
    expect(mockStartSessionWithEvent).toHaveBeenCalledWith('user-1', {
      session_id: expect.stringMatching(/^session_/),
      title: 'Untitled Session',
      event: expect.objectContaining({
        id: expect.stringMatching(/^evt-/),
        role: 'user',
        event_type: 'user_input',
        content: 'Hello there',
      }),
    });
    expect(spies.refreshPersistedSessions).toHaveBeenCalled();
    expect(mockAppendSessionMessages).toHaveBeenCalled();
    const persistedEvents = mockAppendSessionMessages.mock.calls.flatMap((call) => call[1] ?? []);
    expect(persistedEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event_type: 'model_response',
        trigger_event_id: expect.stringMatching(/^evt-/),
        artwork_ids: [],
        payload: { status: 'pending', response_kind: 'general' },
      }),
    ]));
    expect(mockUpdateSessionEvent).toHaveBeenCalledWith(
      expect.stringMatching(/^session_/),
      expect.stringMatching(/^response-/),
      expect.objectContaining({
        event_type: 'model_response',
        content: 'assistant reply',
        artwork_ids: [],
        payload: { status: 'completed', response_kind: 'general' },
      }),
    );
    expect(mockStreamSessionChat).toHaveBeenCalledTimes(1);
  });

  it('persists artwork-linked replies as model_response events', async () => {
    const summary = createSessionSummary({
      id: 'visit-1',
      items: [
        {
          id: 'item-1',
          artworkId: 'art-1',
          url: 'https://example.com/a.jpg',
          keywords: [],
          vibe: {
            backgroundColor: '#fff',
            padding: 0,
            borderRadius: '12px',
            borderType: 'solid',
            accentColor: '#000',
          },
          timestamp: Date.now(),
          conversation: [],
        } as GalleryItem,
        {
          id: 'item-2',
          artworkId: 'art-2',
          url: 'https://example.com/b.jpg',
          keywords: [],
          vibe: {
            backgroundColor: '#fff',
            padding: 0,
            borderRadius: '12px',
            borderType: 'solid',
            accentColor: '#000',
          },
          timestamp: Date.now(),
          conversation: [],
        } as GalleryItem,
      ],
    });
    const { result } = renderUseSessionMessaging({
      activeSessionSummary: summary,
      sessionSummaries: [summary],
      filteredSessionId: 'visit-1',
      isComposingNewSession: false,
      items: summary.items,
      sessionStreams: { 'visit-1': [] },
    });

    await act(async () => {
      result.current.sendSessionInquiryToSession('visit-1', 'Compare these', summary.items);
    });

    expect(mockAppendSessionMessages).toHaveBeenCalledWith(
      'visit-1',
      expect.arrayContaining([
        expect.objectContaining({
          role: 'model',
          event_type: 'model_response',
          artwork_ids: ['art-1', 'art-2'],
          payload: { status: 'pending', response_kind: 'artwork_commentary' },
        }),
      ]),
    );
    expect(mockUpdateSessionEvent).toHaveBeenCalledWith(
      'visit-1',
      expect.stringMatching(/^response-/),
      expect.objectContaining({
        role: 'model',
        event_type: 'model_response',
        artwork_ids: ['art-1', 'art-2'],
        payload: { status: 'completed', response_kind: 'artwork_commentary' },
        content: 'assistant reply',
      }),
    );
  });

  it('persists failed commentary status when the stream errors', async () => {
    mockStreamSessionChat.mockImplementation((
      _items: GalleryItem[],
      _history: SessionStreamMessage[],
      _text: string,
      _onChunk: (chunk: string) => void,
      _onComplete: (fullResponse: string) => void,
      onError: () => void,
    ) => {
      onError();
    });

    const summary = createSessionSummary({
      id: 'visit-1',
      items: [
        {
          id: 'item-1',
          artworkId: 'art-1',
          url: 'https://example.com/a.jpg',
          keywords: [],
          vibe: {
            backgroundColor: '#fff',
            padding: 0,
            borderRadius: '12px',
            borderType: 'solid',
            accentColor: '#000',
          },
          timestamp: Date.now(),
          conversation: [],
        } as GalleryItem,
      ],
    });
    const { result } = renderUseSessionMessaging({
      activeSessionSummary: summary,
      sessionSummaries: [summary],
      filteredSessionId: 'visit-1',
      isComposingNewSession: false,
      items: summary.items,
      sessionStreams: { 'visit-1': [] },
    });

    await act(async () => {
      result.current.sendSessionInquiryToSession('visit-1', 'Compare these', summary.items);
    });

    expect(mockAppendSessionMessages).toHaveBeenCalledWith(
      'visit-1',
      expect.arrayContaining([
        expect.objectContaining({
          role: 'model',
          event_type: 'model_response',
          artwork_ids: ['art-1'],
          payload: { status: 'pending', response_kind: 'artwork_commentary' },
        }),
      ]),
    );
    expect(mockUpdateSessionEvent).toHaveBeenCalledWith(
      'visit-1',
      expect.stringMatching(/^response-/),
      expect.objectContaining({
        role: 'model',
        event_type: 'model_response',
        artwork_ids: ['art-1'],
        payload: {
          status: 'failed',
          response_kind: 'artwork_commentary',
          error_message: 'Something interrupted the reflection stream. Please try again.',
        },
      }),
    );
  });

  it('keeps the draft intact when the first-message commit fails', async () => {
    mockStartSessionWithEvent.mockRejectedValue(new Error('network down'));
    const { result, spies } = renderUseSessionMessaging();
    let didSubmit = true;

    await act(async () => {
      didSubmit = await result.current.handleSessionInquiry('Hello there');
    });

    expect(didSubmit).toBe(false);
    expect(spies.showToast).toHaveBeenCalledWith('Couldn’t send your first message. Try again.', 'info');
    expect(mockAppendSessionMessages).not.toHaveBeenCalled();
    expect(mockStreamSessionChat).not.toHaveBeenCalled();
  });

  it('rejects a new user message while the active session response is still streaming', async () => {
    const summary = createSessionSummary({ id: 'visit-1' });
    const { result } = renderUseSessionMessaging({
      activeSessionSummary: summary,
      sessionSummaries: [summary],
      filteredSessionId: 'visit-1',
      isComposingNewSession: false,
      sessionStreams: { 'visit-1': [] },
      streamingSessionResponses: { 'visit-1': '' },
    });
    let didSubmit = true;

    await act(async () => {
      didSubmit = await result.current.handleSessionInquiry('Second message too soon');
    });

    expect(didSubmit).toBe(false);
    expect(mockAppendSessionMessages).not.toHaveBeenCalled();
    expect(mockStreamSessionChat).not.toHaveBeenCalled();
  });
});
