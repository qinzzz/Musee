import { useEffect, useRef, useState } from 'react';
import type { SessionChatPhase } from '@musee/client-core';

const COLLECTION_SEARCH_MIN_VISIBLE_MS = 600;

/** Presentation timing does not delay execution or persistence. */
export function useSessionResponsePhase(phase: SessionChatPhase | null, conversation: unknown) {
  const [visible, setVisible] = useState<SessionChatPhase | null>(phase);
  const shownAt = useRef<number | null>(null);
  const previousConversation = useRef(conversation);
  useEffect(() => {
    if (previousConversation.current !== conversation) {
      previousConversation.current = conversation;
      shownAt.current = null;
    }
    if (phase === 'retrieving_collection') {
      shownAt.current = Date.now();
      setVisible(phase);
      return;
    }
    const remaining = shownAt.current === null ? 0 : COLLECTION_SEARCH_MIN_VISIBLE_MS - (Date.now() - shownAt.current);
    if (remaining > 0 && (phase === 'generating_response' || phase === null)) {
      const timer = setTimeout(() => { shownAt.current = null; setVisible(phase); }, remaining);
      return () => clearTimeout(timer);
    }
    shownAt.current = null;
    setVisible(phase);
  }, [phase, conversation]);
  return visible;
}
