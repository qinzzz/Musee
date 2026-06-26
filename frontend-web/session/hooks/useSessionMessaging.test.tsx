import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionMessaging } from './useSessionMessaging';
import type { GalleryItem, Visit } from '../../types';
import type { SessionStreamMessage, SessionSummary } from '../types';

const {
  mockAppendSessionMessages,
  mockCreateSession,
  mockStartSessionWithMessage,
  mockStreamSessionChat,
} = vi.hoisted(() => ({
  mockAppendSessionMessages: vi.fn(),
  mockCreateSession: vi.fn(),
  mockStartSessionWithMessage: vi.fn(),
  mockStreamSessionChat: vi.fn(),
}));

vi.mock('../api/sessions', () => ({
  appendSessionMessages: mockAppendSessionMessages,
  createSession: mockCreateSession,
  startSessionWithMessage: mockStartSessionWithMessage,
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
    items: [] as GalleryItem[],
    sessionStreams: options.sessionStreams ?? {},
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
    mockStartSessionWithMessage.mockResolvedValue({ inserted: 1, session: { id: 'session-1', title: 'Untitled Session' } });
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
    expect(mockStartSessionWithMessage).toHaveBeenCalledWith('user-1', {
      session_id: expect.stringMatching(/^session_/),
      title: 'Untitled Session',
      message: expect.objectContaining({
        role: 'user',
        type: 'text',
        content: 'Hello there',
      }),
    });
    expect(spies.refreshPersistedSessions).toHaveBeenCalled();
    expect(mockAppendSessionMessages).toHaveBeenCalled();
    expect(mockStreamSessionChat).toHaveBeenCalledTimes(1);
  });

  it('keeps the draft intact when the first-message commit fails', async () => {
    mockStartSessionWithMessage.mockRejectedValue(new Error('network down'));
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
});
