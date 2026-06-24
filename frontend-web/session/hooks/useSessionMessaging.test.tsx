import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionMessaging } from './useSessionMessaging';
import type { GalleryItem, Visit } from '../../types';
import type { VisitDraft, VisitStreamMessage, VisitSummary } from '../types';

const {
  mockAppendSessionMessages,
  mockCreateSession,
  mockStartSessionWithMessage,
  mockVisitChatStream,
} = vi.hoisted(() => ({
  mockAppendSessionMessages: vi.fn(),
  mockCreateSession: vi.fn(),
  mockStartSessionWithMessage: vi.fn(),
  mockVisitChatStream: vi.fn(),
}));

vi.mock('../api/sessions', () => ({
  appendSessionMessages: mockAppendSessionMessages,
  createSession: mockCreateSession,
  startSessionWithMessage: mockStartSessionWithMessage,
}));

vi.mock('../../api/chat', () => ({
  visitChatStream: mockVisitChatStream,
}));

function createVisitSummary(overrides: Partial<VisitSummary> = {}): VisitSummary {
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
  activeVisitSummary?: VisitSummary | null;
  filteredVisitId?: string | null;
  isComposingNewSession?: boolean;
  visitSummaries?: VisitSummary[];
  visitStreams?: Record<string, VisitStreamMessage[]>;
} = {}) {
  const refreshPersistedSessions = vi.fn();
  const setVisitDrafts = vi.fn();
  const setFilteredVisitId = vi.fn();
  const setIsComposingNewSession = vi.fn();
  const setVisit = vi.fn();
  const setVisitStreams = vi.fn();
  const setStreamingVisitResponses = vi.fn();
  const showToast = vi.fn();

  const hook = renderHook(() => useSessionMessaging({
    defaultVisitTitle: 'Untitled Session',
    sessionUserId: 'user-1',
    filteredVisitId: options.filteredVisitId ?? null,
    isComposingNewSession: options.isComposingNewSession ?? true,
    items: [] as GalleryItem[],
    visitStreams: options.visitStreams ?? {},
    sessionGoals: {},
    visitSummaries: options.visitSummaries ?? [],
    activeVisitSummary: options.activeVisitSummary ?? null,
    refreshPersistedSessions,
    setVisitDrafts,
    setFilteredVisitId,
    setIsComposingNewSession,
    setVisit,
    setVisitStreams,
    setStreamingVisitResponses,
    showToast,
  }));

  return {
    ...hook,
    spies: {
      refreshPersistedSessions,
      setVisitDrafts,
      setFilteredVisitId,
      setIsComposingNewSession,
      setVisit,
      setVisitStreams,
      setStreamingVisitResponses,
      showToast,
    },
  };
}

describe('useSessionMessaging', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockAppendSessionMessages.mockResolvedValue(undefined);
    mockCreateSession.mockResolvedValue({ session: { id: 'visit-1' } });
    mockStartSessionWithMessage.mockResolvedValue({ inserted: 1, session: { id: 'visit-1', title: 'Untitled Session' } });
    mockVisitChatStream.mockImplementation((
      _items: GalleryItem[],
      _history: VisitStreamMessage[],
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
      didSubmit = await result.current.handleVisitInquiry('Hello there');
    });

    expect(didSubmit).toBe(true);
    expect(mockStartSessionWithMessage).toHaveBeenCalledWith('user-1', {
      session_id: expect.stringMatching(/^visit_/),
      title: 'Untitled Session',
      message: expect.objectContaining({
        role: 'user',
        type: 'text',
        content: 'Hello there',
      }),
    });
    expect(spies.refreshPersistedSessions).toHaveBeenCalled();
    expect(mockAppendSessionMessages).toHaveBeenCalled();
    expect(mockVisitChatStream).toHaveBeenCalledTimes(1);
  });

  it('keeps the draft intact when the first-message commit fails', async () => {
    mockStartSessionWithMessage.mockRejectedValue(new Error('network down'));
    const { result, spies } = renderUseSessionMessaging();
    let didSubmit = true;

    await act(async () => {
      didSubmit = await result.current.handleVisitInquiry('Hello there');
    });

    expect(didSubmit).toBe(false);
    expect(spies.showToast).toHaveBeenCalledWith('Couldn’t send your first message. Try again.', 'info');
    expect(mockAppendSessionMessages).not.toHaveBeenCalled();
    expect(mockVisitChatStream).not.toHaveBeenCalled();
  });
});
