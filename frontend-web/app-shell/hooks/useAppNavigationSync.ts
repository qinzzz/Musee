import { useEffect, useEffectEvent } from 'react';
import type { SmartCollection } from '../../api/artworks';
import {
  buildCaptureHistoryState,
  buildRootHistoryState,
  getInitialNavigationState,
  stateToPath,
  type AppTab,
  type ArtistPageContext,
  type ArtworkDetailContext,
  type CollectTab,
  type NavigationHistoryState,
} from '../../lib/appNavigation';
import type { CaptureState } from './useCaptureNavigation';

type UseAppNavigationSyncOptions = {
  activeTab: AppTab;
  collectTab: CollectTab;
  artistPageContext: ArtistPageContext | null;
  movementPageContext: SmartCollection | null;
  artworkDetailContext: ArtworkDetailContext | null;
  captureState: CaptureState;
  interpretingItem: { id: string } | null;
  onRestoreArtworkFromHistory: (artworkId: string, context: ArtworkDetailContext) => void;
  onSetArtistPageContext: (context: ArtistPageContext | null) => void;
  onSetMovementPageContext: (context: SmartCollection | null) => void;
  onSetArtworkDetailContext: (context: ArtworkDetailContext | null) => void;
  onSetCaptureState: (state: CaptureState) => void;
  onRequestLeaveCapture: () => boolean;
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
  captureState,
  interpretingItem,
  onRestoreArtworkFromHistory,
  onSetArtistPageContext,
  onSetMovementPageContext,
  onSetArtworkDetailContext,
  onSetCaptureState,
  onRequestLeaveCapture,
  onSetActiveTab,
  onSetCollectTab,
  onSetInterpretingItem,
}: UseAppNavigationSyncOptions): void {
  const handlePopState = useEffectEvent(() => {
    const historyState = window.history.state as NavigationHistoryState | null;

    if (captureState && historyState?.view !== 'capture') {
      const canLeave = onRequestLeaveCapture();
      if (!canLeave) {
        window.history.pushState(buildCaptureHistoryState(activeTab, collectTab), '', '/capture');
        return;
      }
    }

    if (historyState?.view === 'capture') {
      onSetInterpretingItem(null);
      onSetArtworkDetailContext(null);
      onSetArtistPageContext(null);
      onSetMovementPageContext(null);
      onSetActiveTab(historyState.activeTab);
      onSetCollectTab(historyState.collectTab);
      onSetCaptureState(captureState || { key: Date.now(), hasUnsavedCaptures: false });
      return;
    }

    if (historyState?.view === 'artwork') {
      onSetCaptureState(null);
      onSetArtistPageContext(null);
      onSetMovementPageContext(null);
      onRestoreArtworkFromHistory(historyState.artworkId, historyState.artworkContext);
      return;
    }

    if (historyState?.view === 'artist') {
      onSetCaptureState(null);
      onSetInterpretingItem(null);
      onSetArtworkDetailContext(null);
      onSetMovementPageContext(null);
      onSetArtistPageContext(historyState.artistContext);
      return;
    }

    onSetInterpretingItem(null);
    onSetArtworkDetailContext(null);
    onSetCaptureState(null);

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
    if (artistPageContext || movementPageContext || interpretingItem || captureState) {
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
    captureState,
  ]);
}
