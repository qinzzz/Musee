import { describe, expect, it } from 'vitest';
import type { GalleryItem } from '../../types';
import type { SessionRenderBlock, SessionSummary, SessionStreamMessage } from '../types';
import {
  getSessionProcessingLabel,
  getSessionProcessingState,
  isSessionProcessing,
  SESSION_PENDING_RESPONSE_STALE_MS,
  SESSION_PROCESSING_LABELS,
} from './sessionProcessingState';

const NOW = 1_000_000;

function createSummary(items: GalleryItem[] = []): SessionSummary {
  return {
    id: 'session-1',
    title: 'Session',
    location: null,
    artworkCount: items.length,
    updatedAt: NOW,
    dateLabel: null,
    items,
  };
}

function createCommentary(
  status: 'pending' | 'completed' | 'failed',
  createdAt = NOW,
): Extract<SessionRenderBlock, { type: 'commentary' }> {
  const message: SessionStreamMessage = {
    id: 'response-1',
    role: 'model',
    type: 'model_response',
    text: '',
    createdAt,
    payload: { status },
  };
  return {
    type: 'commentary',
    id: message.id,
    createdAt,
    message,
    status,
  };
}

function derive(overrides: Partial<Parameters<typeof getSessionProcessingState>[0]> = {}) {
  return getSessionProcessingState({
    activeSessionSummary: createSummary(),
    sessionRenderBlocks: [],
    isAddingArtworks: false,
    isAnalyzingArtworks: false,
    hasLiveResponse: false,
    now: NOW,
    ...overrides,
  });
}

describe('session processing state', () => {
  it('uses lightweight labels without artwork counts', () => {
    expect(SESSION_PROCESSING_LABELS.addingArtworks).toBe('Adding artworks…');
    expect(SESSION_PROCESSING_LABELS.analyzingArtworks).toBe('Analyzing artworks…');
    expect(SESSION_PROCESSING_LABELS.preparingResponse).toBe('Preparing response…');
    expect(SESSION_PROCESSING_LABELS.searchingCollection).toBe('Searching your collection…');
    expect(SESSION_PROCESSING_LABELS.writingResponse).toBe('Writing response…');
    expect(Object.values(SESSION_PROCESSING_LABELS).join(' ')).not.toMatch(/\d/);
  });

  it('surfaces collection retrieval as an explicit response phase', () => {
    const pending = createCommentary('pending');
    pending.message.payload = { status: 'pending', phase: 'retrieving_collection' };

    const state = derive({ hasLiveResponse: true, sessionRenderBlocks: [pending] });

    expect(state).toEqual({ kind: 'searching_collection', responseId: 'response-1' });
    expect(isSessionProcessing(state)).toBe(true);
    expect(getSessionProcessingLabel(state)).toBe('Searching your collection…');
  });

  it('derives adding, writing, and analyzing in lifecycle priority order', () => {
    const pending = createCommentary('pending');
    expect(derive({
      isAddingArtworks: true,
      isAnalyzingArtworks: true,
      hasLiveResponse: true,
      sessionRenderBlocks: [pending],
    })).toEqual({ kind: 'adding_artworks' });
    expect(derive({
      isAnalyzingArtworks: true,
      hasLiveResponse: true,
      sessionRenderBlocks: [pending],
    })).toEqual({ kind: 'writing_response', responseId: 'response-1' });
    expect(derive({ isAnalyzingArtworks: true })).toEqual({ kind: 'analyzing_artworks' });
  });

  it('turns a stale persisted pending response into a non-blocking failure', () => {
    const stale = createCommentary('pending', NOW - SESSION_PENDING_RESPONSE_STALE_MS);
    const state = derive({ sessionRenderBlocks: [stale] });

    expect(state).toEqual({
      kind: 'failed',
      responseId: 'response-1',
      message: SESSION_PROCESSING_LABELS.responseFailed,
    });
    expect(isSessionProcessing(state)).toBe(false);
    expect(getSessionProcessingLabel(state)).toBe('Response interrupted. Please try again.');
  });

  it('does not let an older failed response override a newer user turn', () => {
    const failed = createCommentary('failed');
    const nextInput: SessionRenderBlock = {
      type: 'message',
      id: 'message-2',
      createdAt: NOW + 1,
      message: {
        id: 'message-2',
        role: 'user',
        text: 'Try something else',
        createdAt: NOW + 1,
      },
    };

    expect(derive({ sessionRenderBlocks: [failed, nextInput] })).toEqual({ kind: 'idle' });
  });
});
