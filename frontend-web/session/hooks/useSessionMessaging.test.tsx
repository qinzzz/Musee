import { act, renderHook, waitFor } from '@testing-library/react';
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
  SessionAuthenticationError: class SessionAuthenticationError extends Error {
    code: string;

    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
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
    isComposingNewSession: options.isComposingNewSession ?? true,
    items: options.items ?? [] as GalleryItem[],
    sessionStreams: options.sessionStreams ?? {},
    streamingSessionResponses: options.streamingSessionResponses ?? {},
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
    vi.useRealTimers();
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
      title: 'Hello there',
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
        payload: { status: 'pending' },
      }),
    ]));
    expect(mockUpdateSessionEvent).toHaveBeenCalledWith(
      expect.stringMatching(/^session_/),
      expect.stringMatching(/^evt-/),
      expect.objectContaining({
        event_type: 'model_response',
        content: 'assistant reply',
        artwork_ids: [],
        payload: { status: 'completed' },
      }),
    );
    expect(mockStreamSessionChat).toHaveBeenCalledTimes(1);
  });

  it('rejects rapid duplicate submits before the first session event finishes saving', async () => {
    let resolveFirstCommit: ((value: { inserted: number; session: { id: string; title: string } }) => void) | undefined;
    mockStartSessionWithEvent.mockReturnValueOnce(new Promise((resolve) => {
      resolveFirstCommit = resolve;
    }));
    const { result, spies } = renderUseSessionMessaging();
    let firstSubmit: Promise<boolean> | undefined;
    let duplicateResult = true;

    act(() => {
      firstSubmit = result.current.handleSessionInquiry('Only once');
    });
    await act(async () => {
      duplicateResult = await result.current.handleSessionInquiry('Only once');
    });

    expect(duplicateResult).toBe(false);
    expect(mockStartSessionWithEvent).toHaveBeenCalledTimes(1);
    expect(spies.setSessionDrafts).toHaveBeenCalledTimes(2);
    expect(mockStreamSessionChat).not.toHaveBeenCalled();

    await act(async () => {
      resolveFirstCommit?.({ inserted: 1, session: { id: 'session-1', title: 'Untitled Session' } });
      await firstSubmit;
    });

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
          payload: { status: 'pending' },
        }),
      ]),
    );
    expect(mockUpdateSessionEvent).toHaveBeenCalledWith(
      'visit-1',
      expect.stringMatching(/^evt-/),
      expect.objectContaining({
        role: 'model',
        event_type: 'model_response',
        artwork_ids: ['art-1', 'art-2'],
        payload: { status: 'completed' },
        content: 'assistant reply',
      }),
    );
  });

  it('keeps the collection-search phase visible before returning to writing', () => {
    vi.useFakeTimers();
    mockStreamSessionChat.mockImplementation((
      _items: GalleryItem[],
      _history: SessionStreamMessage[],
      _text: string,
      _onChunk: (chunk: string) => void,
      _onComplete: (fullResponse: string) => void,
      _onError: () => void,
      context: { onPhase?: (phase: 'planning' | 'retrieving_collection' | 'generating_response') => void },
    ) => {
      context.onPhase?.('planning');
      context.onPhase?.('retrieving_collection');
      context.onPhase?.('generating_response');
    });

    const summary = createSessionSummary({ id: 'visit-1' });
    const { result, spies } = renderUseSessionMessaging({
      activeSessionSummary: summary,
      sessionSummaries: [summary],
      filteredSessionId: 'visit-1',
      isComposingNewSession: false,
      sessionStreams: { 'visit-1': [] },
    });

    act(() => {
      result.current.sendSessionInquiryToSession('visit-1', 'Search my collection');
    });

    const readLatestPhase = () => {
      const streams = spies.setSessionStreams.mock.calls.reduce<Record<string, SessionStreamMessage[]>>(
        (state, [update]) => (typeof update === 'function' ? update(state) : update),
        {},
      );
      return streams['visit-1']?.find((message) => message.role === 'model')?.payload?.phase;
    };

    expect(readLatestPhase()).toBe('retrieving_collection');

    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(readLatestPhase()).toBe('generating_response');
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
          payload: { status: 'pending' },
        }),
      ]),
    );
    expect(mockUpdateSessionEvent).toHaveBeenCalledWith(
      'visit-1',
      expect.stringMatching(/^evt-/),
      expect.objectContaining({
        role: 'model',
        event_type: 'model_response',
        artwork_ids: ['art-1'],
        payload: {
          status: 'failed',
          error_message: 'Something interrupted the reflection stream. Please try again.',
        },
      }),
    );
  });

  it('warns when a completed model response cannot be saved after fallback', async () => {
    mockAppendSessionMessages
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('fallback failed'));
    mockUpdateSessionEvent.mockRejectedValueOnce(new Error('response not found'));

    const summary = createSessionSummary({ id: 'visit-1' });
    const { result, spies } = renderUseSessionMessaging({
      activeSessionSummary: summary,
      sessionSummaries: [summary],
      filteredSessionId: 'visit-1',
      isComposingNewSession: false,
      sessionStreams: { 'visit-1': [] },
    });

    await act(async () => {
      result.current.sendSessionInquiryToSession('visit-1', 'Tell me more');
    });

    await waitFor(() => {
      expect(spies.showToast).toHaveBeenCalledWith(
        'This response couldn’t be saved. Try again.',
        'info',
      );
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to persist completed model response:',
      expect.any(Error),
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
    expect(spies.showToast).not.toHaveBeenCalled();
    expect(spies.setSessionStreams).toHaveBeenCalledTimes(2);
    const localStreams = spies.setSessionStreams.mock.calls.reduce<Record<string, SessionStreamMessage[]>>(
      (state, [update]) => (typeof update === 'function' ? update(state) : update),
      {},
    );
    const localSession = Object.values(localStreams)[0];
    expect(localSession).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'user', text: 'Hello there' }),
      expect.objectContaining({
        role: 'model',
        text: 'Couldn’t save this session',
        payload: {
          message_kind: 'session_failure',
          error_code: 'session_save_failed',
        },
      }),
    ]));
    expect(mockAppendSessionMessages).not.toHaveBeenCalled();
    expect(mockStreamSessionChat).not.toHaveBeenCalled();
  });

  it('turns a guest limit into a resumable sign-in action', async () => {
    mockStreamSessionChat.mockImplementation((
      _items: GalleryItem[],
      _history: SessionStreamMessage[],
      _text: string,
      _onChunk: (chunk: string) => void,
      _onComplete: (fullResponse: string) => void,
      onError: (error: Error) => void,
    ) => {
      onError(Object.assign(new Error('Guest limit'), { code: 'guest_quota_exhausted' }));
    });
    const summary = createSessionSummary({ id: 'visit-1' });
    const { result } = renderUseSessionMessaging({
      activeSessionSummary: summary,
      sessionSummaries: [summary],
      filteredSessionId: 'visit-1',
      isComposingNewSession: false,
      sessionStreams: { 'visit-1': [] },
    });

    await act(async () => {
      result.current.sendSessionInquiryToSession('visit-1', 'Continue this thought');
    });

    await waitFor(() => {
      expect(mockUpdateSessionEvent).toHaveBeenCalledWith(
        'visit-1',
        expect.stringMatching(/^evt-/),
        expect.objectContaining({
          content: 'You’ve reached the guest preview limit. Sign in to continue this conversation.',
          payload: {
            status: 'auth_required',
            error_code: 'guest_quota_exhausted',
            retry_message: 'Continue this thought',
            retry_mode: 'append_message',
          },
        }),
      );
    });
  });

  it('makes a blocked first guest session resumable after sign-in', async () => {
    mockStartSessionWithEvent.mockRejectedValue(
      Object.assign(new Error('Guest limit'), { code: 'guest_quota_exhausted' }),
    );
    const { result, spies } = renderUseSessionMessaging();

    await act(async () => {
      await result.current.handleSessionInquiry('A second guest session');
    });

    const localStreams = spies.setSessionStreams.mock.calls.reduce<Record<string, SessionStreamMessage[]>>(
      (state, [update]) => (typeof update === 'function' ? update(state) : update),
      {},
    );
    const localSession = Object.values(localStreams)[0];
    expect(localSession).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'user', text: 'A second guest session' }),
      expect.objectContaining({
        role: 'model',
        type: 'model_response',
        payload: expect.objectContaining({
          status: 'auth_required',
          error_code: 'guest_quota_exhausted',
          retry_message: 'A second guest session',
          retry_mode: 'start_session',
        }),
      }),
    ]));
  });

  it('persists the blocked guest message before resuming after sign-in', async () => {
    const userMessage: SessionStreamMessage = {
      id: 'guest-message',
      role: 'user',
      text: 'Continue this thought',
      createdAt: 100,
    };
    const summary = createSessionSummary({ id: 'visit-1' });
    const { result } = renderUseSessionMessaging({
      activeSessionSummary: summary,
      sessionSummaries: [summary],
      filteredSessionId: 'visit-1',
      isComposingNewSession: false,
      sessionStreams: { 'visit-1': [userMessage] },
    });

    await act(async () => {
      await result.current.retryAuthenticationRequiredResponse({
        sessionId: 'visit-1',
        responseId: 'guest-response',
        message: 'Continue this thought',
        parentEventId: 'guest-message',
        mode: 'append_message',
      });
    });

    expect(mockAppendSessionMessages).toHaveBeenCalledWith(
      'visit-1',
      [expect.objectContaining({ id: 'guest-message', role: 'user', content: 'Continue this thought' })],
    );
    expect(mockStreamSessionChat).toHaveBeenCalledTimes(1);
  });

  it('creates a blocked first session before resuming it after sign-in', async () => {
    const userMessage: SessionStreamMessage = {
      id: 'first-guest-message',
      role: 'user',
      text: 'Start this thought',
      createdAt: 100,
    };
    const { result } = renderUseSessionMessaging({
      isComposingNewSession: false,
      sessionStreams: { 'guest-session': [userMessage] },
    });

    await act(async () => {
      await result.current.retryAuthenticationRequiredResponse({
        sessionId: 'guest-session',
        responseId: 'guest-response',
        message: 'Start this thought',
        parentEventId: 'first-guest-message',
        mode: 'start_session',
        sessionTitle: 'Start this thought',
      });
    });

    expect(mockStartSessionWithEvent).toHaveBeenCalledWith('user-1', {
      session_id: 'guest-session',
      title: 'Start this thought',
      event: expect.objectContaining({
        id: 'first-guest-message',
        content: 'Start this thought',
      }),
    });
    expect(mockStreamSessionChat).toHaveBeenCalledTimes(1);
  });

  it('allows a new submit after the initial event save fails', async () => {
    mockStartSessionWithEvent
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ inserted: 1, session: { id: 'session-1', title: 'Untitled Session' } });
    const { result } = renderUseSessionMessaging();
    let firstResult = true;
    let secondResult = false;

    await act(async () => {
      firstResult = await result.current.handleSessionInquiry('First attempt');
      secondResult = await result.current.handleSessionInquiry('Second attempt');
    });

    expect(firstResult).toBe(false);
    expect(secondResult).toBe(true);
    expect(mockStartSessionWithEvent).toHaveBeenCalledTimes(2);
    expect(mockStreamSessionChat).toHaveBeenCalledTimes(1);
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
