import { useEffect, useMemo, useState } from 'react';
import type { SessionRenderBlock, SessionSummary } from '../types';
import {
  getSessionProcessingState,
  getTailCommentaryBlock,
  SESSION_PENDING_RESPONSE_STALE_MS,
} from '../lib/sessionProcessingState';

type UseSessionProcessingStateOptions = {
  activeSessionSummary: SessionSummary | null;
  sessionRenderBlocks: SessionRenderBlock[];
  isAddingArtworks: boolean;
  isAnalyzingArtworks: boolean;
  hasLiveResponse: boolean;
};

export function useSessionProcessingState(options: UseSessionProcessingStateOptions) {
  const [now, setNow] = useState(() => Date.now());
  const tailCommentary = getTailCommentaryBlock(options.sessionRenderBlocks);

  useEffect(() => {
    setNow(Date.now());
  }, [tailCommentary?.id, tailCommentary?.status]);

  useEffect(() => {
    if (!tailCommentary || tailCommentary.status !== 'pending') return undefined;
    const delay = Math.max(0, tailCommentary.createdAt + SESSION_PENDING_RESPONSE_STALE_MS - Date.now());
    const timeout = window.setTimeout(() => setNow(Date.now()), delay + 1);
    return () => window.clearTimeout(timeout);
  }, [tailCommentary]);

  return useMemo(() => getSessionProcessingState({ ...options, now }), [now, options]);
}
