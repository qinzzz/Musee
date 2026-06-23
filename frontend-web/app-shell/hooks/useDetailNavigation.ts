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
import type { InterpretingItem } from '../../artwork/types';

type UseDetailNavigationOptions = {
  activeTab: AppTab;
  collectTab: CollectTab;
  setArtistPageContext: Dispatch<SetStateAction<ArtistPageContext | null>>;
  setMovementPageContext: Dispatch<SetStateAction<SmartCollection | null>>;
  artworkDetailContext: ArtworkDetailContext | null;
  setArtworkDetailContext: Dispatch<SetStateAction<ArtworkDetailContext | null>>;
  buildInterpretingItem: (item: GalleryItem, allItems?: GalleryItem[]) => InterpretingItem;
  setInterpretingItem: Dispatch<SetStateAction<InterpretingItem | null>>;
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
  buildInterpretingItem,
  setInterpretingItem,
  setArtworkHeaderEditToken,
  setActiveTab,
  setCollectTab,
}: UseDetailNavigationOptions) {
  const clearShellOverlays = useCallback(() => {
    setArtistPageContext(null);
    setMovementPageContext(null);
    setInterpretingItem(null);
    setArtworkDetailContext(null);
  }, [setArtistPageContext, setArtworkDetailContext, setInterpretingItem, setMovementPageContext]);

  const openArtworkDetail = useCallback((item: GalleryItem, context: ArtworkDetailContext, allItems?: GalleryItem[]) => {
    setArtworkHeaderEditToken(0);
    setMovementPageContext(null);
    setArtistPageContext(null);
    setArtworkDetailContext(context);
    setInterpretingItem(buildInterpretingItem(item, allItems));
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
  }, [activeTab, buildInterpretingItem, collectTab, setArtistPageContext, setArtworkDetailContext, setArtworkHeaderEditToken, setInterpretingItem, setMovementPageContext]);

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

    setInterpretingItem(null);
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
  }, [activeTab, artworkDetailContext, collectTab, setArtistPageContext, setArtworkDetailContext, setArtworkHeaderEditToken, setInterpretingItem]);

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
    setInterpretingItem(null);
    setArtworkDetailContext(null);
  }, [setArtistPageContext, setArtworkDetailContext, setInterpretingItem, setMovementPageContext]);

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
