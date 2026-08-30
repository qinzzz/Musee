import { useCallback, useEffect, useState } from 'react';
import type { SmartCollection } from '../../api/artworks';
import {
  buildRootHistoryState,
  getInitialNavigationState,
  type AppTab,
  type ArtistPageContext,
  type ArtworkDetailContext,
  type CollectTab,
} from '../../lib/appNavigation';

type UseAppRouteStateOptions = {
  pathname?: string;
  canSearchCollection: boolean;
  canViewProfile: boolean;
};

function canAccessTab(
  tab: AppTab,
  canSearchCollection: boolean,
  canViewProfile: boolean,
): boolean {
  return (
    (tab !== 'collect' || canSearchCollection)
    && (tab !== 'profile' || canViewProfile)
  );
}

export function useAppRouteState({
  pathname = window.location.pathname,
  canSearchCollection,
  canViewProfile,
}: UseAppRouteStateOptions) {
  const canAccessRoute = useCallback((tab: AppTab) => (
    canAccessTab(tab, canSearchCollection, canViewProfile)
  ), [canSearchCollection, canViewProfile]);
  const [initialNavigationState] = useState(() => {
    const requestedState = getInitialNavigationState(pathname);
    if (canAccessRoute(requestedState.activeTab)) {
      return requestedState;
    }

    return {
      ...requestedState,
      activeTab: 'newSession' as const,
      artistPageContext: null,
    };
  });
  const [activeTab, setActiveTab] = useState<AppTab>(initialNavigationState.activeTab);
  const [collectTab, setCollectTab] = useState<CollectTab>(initialNavigationState.collectTab);
  const [artistPageContext, setArtistPageContext] = useState<ArtistPageContext | null>(
    initialNavigationState.artistPageContext,
  );
  const [movementPageContext, setMovementPageContext] = useState<SmartCollection | null>(null);
  const [artworkDetailContext, setArtworkDetailContext] = useState<ArtworkDetailContext | null>(null);

  useEffect(() => {
    if (canAccessRoute(activeTab)) return;

    setActiveTab('newSession');
    setArtistPageContext(null);
    setMovementPageContext(null);
    setArtworkDetailContext(null);
    window.history.replaceState(buildRootHistoryState('newSession', 'saved'), '', '/');
  }, [activeTab, canAccessRoute]);

  return {
    activeTab,
    setActiveTab,
    collectTab,
    setCollectTab,
    learningInitialGuide: initialNavigationState.learningInitialGuide,
    artistPageContext,
    setArtistPageContext,
    movementPageContext,
    setMovementPageContext,
    artworkDetailContext,
    setArtworkDetailContext,
    canAccessTab: canAccessRoute,
  };
}
