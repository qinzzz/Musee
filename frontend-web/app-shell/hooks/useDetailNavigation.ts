import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { SmartCollection } from '../../api/artworks';
import {
  buildRootHistoryState,
  slugifyName,
  stateToPath,
  type AppTab,
  type ArtistPageContext,
  type ArtworkDetailContext,
  type CollectTab,
  type NavigationHistoryState,
} from '../../lib/appNavigation';
import type { GalleryItem } from '../../types';
import type { ArtworkDetailSelection } from '../../artwork/types';

type UseDetailNavigationOptions = {
  activeTab: AppTab;
  collectTab: CollectTab;
  setArtistPageContext: Dispatch<SetStateAction<ArtistPageContext | null>>;
  setMovementPageContext: Dispatch<SetStateAction<SmartCollection | null>>;
  artworkDetailContext: ArtworkDetailContext | null;
  setArtworkDetailContext: Dispatch<SetStateAction<ArtworkDetailContext | null>>;
  buildArtworkDetailSelection: (item: GalleryItem, allItems?: GalleryItem[]) => ArtworkDetailSelection;
  setArtworkDetailSelection: Dispatch<SetStateAction<ArtworkDetailSelection | null>>;
  setArtworkHeaderEditToken: Dispatch<SetStateAction<number>>;
  setActiveTab: Dispatch<SetStateAction<AppTab>>;
  setCollectTab: Dispatch<SetStateAction<CollectTab>>;
};

export function useDetailNavigation({
  activeTab,
  collectTab,
  setArtistPageContext,
  setMovementPageContext,
  artworkDetailContext,
  setArtworkDetailContext,
  buildArtworkDetailSelection,
  setArtworkDetailSelection,
  setArtworkHeaderEditToken,
  setActiveTab,
  setCollectTab,
}: UseDetailNavigationOptions) {
  const clearShellOverlays = useCallback(() => {
    setArtistPageContext(null);
    setMovementPageContext(null);
    setArtworkDetailSelection(null);
    setArtworkDetailContext(null);
  }, [setArtistPageContext, setArtworkDetailContext, setArtworkDetailSelection, setMovementPageContext]);

  const openArtworkDetail = useCallback((item: GalleryItem, context: ArtworkDetailContext, allItems?: GalleryItem[]) => {
    setArtworkHeaderEditToken(0);
    setMovementPageContext(null);
    setArtistPageContext(null);
    setArtworkDetailContext(context);
    setArtworkDetailSelection(buildArtworkDetailSelection(item, allItems));
    window.history.pushState(
      {
        view: 'artwork',
        artworkId: item.id,
        artworkContext: context,
        activeTab,
        collectTab,
      } satisfies NavigationHistoryState,
      '',
      context.basePath,
    );
  }, [activeTab, buildArtworkDetailSelection, collectTab, setArtistPageContext, setArtworkDetailContext, setArtworkDetailSelection, setArtworkHeaderEditToken, setMovementPageContext]);

  const openArtistDetail = useCallback((context: ArtistPageContext) => {
    const slugSource = context.artistName || context.artistEntityId;
    if (!slugSource) return;
    setArtistPageContext(context);
    window.history.pushState(
      {
        view: 'artist',
        artistContext: context,
        activeTab,
        collectTab,
      } satisfies NavigationHistoryState,
      '',
      `/artists/${slugifyName(slugSource)}`,
    );
  }, [activeTab, collectTab, setArtistPageContext]);

  const closeArtworkDetail = useCallback(() => {
    setArtworkHeaderEditToken(0);
    if (window.history.state?.view === 'artwork') {
      window.history.back();
      return;
    }

    setArtworkDetailSelection(null);
    setArtworkDetailContext(null);

    if (artworkDetailContext?.returnToArtistContext) {
      setArtistPageContext(artworkDetailContext.returnToArtistContext);
      window.history.pushState(
        {
          view: 'artist',
          artistContext: artworkDetailContext.returnToArtistContext,
          activeTab,
          collectTab,
        } satisfies NavigationHistoryState,
        '',
        artworkDetailContext.basePath,
      );
      return;
    }

    window.history.pushState(
      buildRootHistoryState(activeTab, collectTab),
      '',
      artworkDetailContext?.basePath || stateToPath(activeTab, collectTab),
    );
  }, [activeTab, artworkDetailContext, collectTab, setArtistPageContext, setArtworkDetailContext, setArtworkDetailSelection, setArtworkHeaderEditToken]);

  const closeArtistDetail = useCallback(() => {
    if (window.history.state?.view === 'artist') {
      window.history.back();
      return;
    }

    setArtistPageContext(null);
    setActiveTab('collect');
    setCollectTab('artists');
    window.history.pushState(
      {
        view: 'root',
        activeTab: 'collect',
        collectTab: 'artists',
      } satisfies NavigationHistoryState,
      '',
      '/artists',
    );
  }, [setActiveTab, setArtistPageContext, setCollectTab]);

  const navigateArtistIndex = useCallback(() => {
    setArtistPageContext(null);
    setActiveTab('collect');
    setCollectTab('artists');
    window.history.pushState(
      {
        view: 'root',
        activeTab: 'collect',
        collectTab: 'artists',
      } satisfies NavigationHistoryState,
      '',
      '/artists',
    );
  }, [setActiveTab, setArtistPageContext, setCollectTab]);

  const openMovementPage = useCallback((collection: SmartCollection) => {
    setArtistPageContext(null);
    setMovementPageContext(collection);
    setArtworkDetailSelection(null);
    setArtworkDetailContext(null);
  }, [setArtistPageContext, setArtworkDetailContext, setArtworkDetailSelection, setMovementPageContext]);

  const closeMovementPage = useCallback(() => {
    setMovementPageContext(null);
    window.history.pushState(
      buildRootHistoryState(activeTab, collectTab),
      '',
      stateToPath(activeTab, collectTab),
    );
  }, [activeTab, collectTab, setMovementPageContext]);

  return {
    clearShellOverlays,
    openArtworkDetail,
    openArtistDetail,
    closeArtworkDetail,
    closeArtistDetail,
    navigateArtistIndex,
    openMovementPage,
    closeMovementPage,
  };
}
