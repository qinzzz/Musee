import type { SessionRenderBlock, SessionSummary } from '../types';

export const SESSION_PENDING_RESPONSE_STALE_MS = 3 * 60 * 1000;

export const SESSION_PROCESSING_LABELS = {
  addingArtworks: 'Adding artworks…',
  analyzingArtworks: 'Analyzing artworks…',
  preparingResponse: 'Preparing response…',
  searchingCollection: 'Searching your collection…',
  writingResponse: 'Writing response…',
  responseFailed: 'Response interrupted. Please try again.',
} as const;

export type SessionProcessingState =
  | { kind: 'idle' }
  | { kind: 'adding_artworks' }
  | { kind: 'analyzing_artworks' }
  | { kind: 'preparing_response'; responseId?: string }
  | { kind: 'searching_collection'; responseId?: string }
  | { kind: 'writing_response'; responseId?: string }
  | { kind: 'failed'; responseId: string; message: string };

type SessionProcessingStateInput = {
  activeSessionSummary: SessionSummary | null;
  sessionRenderBlocks: SessionRenderBlock[];
  isAddingArtworks: boolean;
  isAnalyzingArtworks: boolean;
  hasLiveResponse: boolean;
  now?: number;
};

export function isSessionProcessing(state: SessionProcessingState): boolean {
  return state.kind === 'adding_artworks'
    || state.kind === 'analyzing_artworks'
    || state.kind === 'preparing_response'
    || state.kind === 'searching_collection'
    || state.kind === 'writing_response';
}

export function getTailCommentaryBlock(
  blocks: SessionRenderBlock[],
): Extract<SessionRenderBlock, { type: 'commentary' }> | null {
  const tail = blocks[blocks.length - 1];
  return tail?.type === 'commentary' ? tail : null;
}

export function isPendingCommentaryStale(
  block: Extract<SessionRenderBlock, { type: 'commentary' }>,
  now = Date.now(),
): boolean {
  return block.status === 'pending'
    && now - block.createdAt >= SESSION_PENDING_RESPONSE_STALE_MS;
}

export function getSessionProcessingState({
  activeSessionSummary,
  sessionRenderBlocks,
  isAddingArtworks,
  isAnalyzingArtworks,
  hasLiveResponse,
  now = Date.now(),
}: SessionProcessingStateInput): SessionProcessingState {
  if (isAddingArtworks) {
    return { kind: 'adding_artworks' };
  }

  const tailCommentary = getTailCommentaryBlock(sessionRenderBlocks);
  if (hasLiveResponse || (tailCommentary?.status === 'pending' && !isPendingCommentaryStale(tailCommentary, now))) {
    const phase = tailCommentary?.message.payload?.phase;
    if (phase === 'planning') {
      return { kind: 'preparing_response', responseId: tailCommentary?.id };
    }
    if (phase === 'retrieving_collection') {
      return { kind: 'searching_collection', responseId: tailCommentary?.id };
    }
    return { kind: 'writing_response', responseId: tailCommentary?.id };
  }

  if (
    isAnalyzingArtworks
    || activeSessionSummary?.items.some((item) => Boolean(item.isAnalyzing))
  ) {
    return { kind: 'analyzing_artworks' };
  }

  if (tailCommentary?.status === 'failed' || (tailCommentary && isPendingCommentaryStale(tailCommentary, now))) {
    return {
      kind: 'failed',
      responseId: tailCommentary.id,
      message: SESSION_PROCESSING_LABELS.responseFailed,
    };
  }

  return { kind: 'idle' };
}

export function getSessionProcessingLabel(state: SessionProcessingState): string | null {
  switch (state.kind) {
    case 'adding_artworks':
      return SESSION_PROCESSING_LABELS.addingArtworks;
    case 'analyzing_artworks':
      return SESSION_PROCESSING_LABELS.analyzingArtworks;
    case 'preparing_response':
      return SESSION_PROCESSING_LABELS.preparingResponse;
    case 'searching_collection':
      return SESSION_PROCESSING_LABELS.searchingCollection;
    case 'writing_response':
      return SESSION_PROCESSING_LABELS.writingResponse;
    case 'failed':
      return state.message;
    case 'idle':
    default:
      return null;
  }
}
