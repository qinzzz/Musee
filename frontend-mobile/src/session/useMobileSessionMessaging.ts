import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { MOBILE_API_BASE_URL, mobileSessionContextService, mobileSessionService } from '../api/runtime';
import { invalidateArtworkLibraryQuery } from '../library/artworkLibraryQuery';
import { createMobileSessionExecution } from './mobileSessionExecution';
import { presentSessionError } from './sessionErrorPresentation';
import { useSessionResponsePhase } from './useSessionResponsePhase';

export type { MobileSessionArtworkPhase } from './mobileSessionExecution';
export type MobileSessionMessagingController = ReturnType<typeof useMobileSessionMessaging>;

export function useMobileSessionMessaging(userId: string) {
  const client = useQueryClient();
  const execution = useMemo(() => createMobileSessionExecution({
    userId,
    sessions: mobileSessionService,
    context: mobileSessionContextService,
    onArtworksChanged: () => invalidateArtworkLibraryQuery(client, userId),
    presentError: (error, stage) => presentSessionError(error, stage, {
      apiBaseUrl: MOBILE_API_BASE_URL, showTechnicalDetails: __DEV__,
    }),
  }), [client, userId]);
  useEffect(() => () => execution.reset(), [execution]);
  const state = useSyncExternalStore(execution.subscribe, execution.getSnapshot);
  const phase = useSessionResponsePhase(state.phase, state.session?.id || userId);
  return { ...execution, ...state, phase };
}
