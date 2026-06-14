import { useEffect, useEffectEvent } from 'react';
import type { SmartCollection } from '../api/artworks';
import {
  buildRootHistoryState,
  getInitialNavigationState,
  stateToPath,
  type AppTab,
  type ArtistPageContext,
  type ArtworkDetailContext,
  type CollectTab,
  type NavigationHistoryState,
} from '../lib/appNavigation';

type UseAppNavigationSyncOptions = {
  activeTab: AppTab;
  collectTab: CollectTab;
  artistPageContext: ArtistPageContext | null;
  movementPageContext: SmartCollection | null;
  artworkDetailContext: ArtworkDetailContext | null;
  interpretingItem: { id: string } | null;
  onRestoreArtworkFromHistory: (artworkId: string, context: ArtworkDetailContext) => void;
  onSetArtistPageContext: (context: ArtistPageContext | null) => void;
  onSetMovementPageContext: (context: SmartCollection | null) => void;
  onSetArtworkDetailContext: (context: ArtworkDetailContext | null) => void;
  onSetActiveTab: (tab: AppTab) => void;
  onSetCollectTab: (tab: CollectTab) => void;
  onSetInterpretingItem: (value: null) => void;
};

export function useAppNavigationSync({
  activeTab,
  collectTab,
  artistPageContext,
  movementPageContext,
  artworkDetailContext,
  interpretingItem,
  onRestoreArtworkFromHistory,
  onSetArtistPageContext,
  onSetMovementPageContext,
  onSetArtworkDetailContext,
  onSetActiveTab,
  onSetCollectTab,
  onSetInterpretingItem,
}: UseAppNavigationSyncOptions): void {
  const handlePopState = useEffectEvent(() => {
    const historyState = window.history.state as NavigationHistoryState | null;

    if (historyState?.view === 'artwork') {
      onSetArtistPageContext(null);
      onSetMovementPageContext(null);
      onRestoreArtworkFromHistory(historyState.artworkId, historyState.artworkContext);
      return;
    }

    if (historyState?.view === 'artist') {
      onSetInterpretingItem(null);
      onSetArtworkDetailContext(null);
      onSetMovementPageContext(null);
      onSetArtistPageContext(historyState.artistContext);
      return;
    }

    onSetInterpretingItem(null);
    onSetArtworkDetailContext(null);

    const initialState = getInitialNavigationState(window.location.pathname);

    onSetArtistPageContext(initialState.artistPageContext);
    onSetMovementPageContext(null);
    onSetActiveTab(initialState.activeTab);
    onSetCollectTab(initialState.collectTab);
  });

  useEffect(() => {
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [handlePopState]);

  useEffect(() => {
    if (artistPageContext || movementPageContext || interpretingItem) {
      return;
    }

    const path = stateToPath(activeTab, collectTab);
    const historyState = buildRootHistoryState(activeTab, collectTab);

    if (window.location.pathname !== path) {
      window.history.pushState(historyState, '', path);
      return;
    }

    window.history.replaceState(historyState, '', path);
  }, [
    activeTab,
    collectTab,
    artistPageContext,
    movementPageContext,
    interpretingItem,
    artworkDetailContext,
  ]);
}
