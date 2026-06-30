import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { ArtworkDetailItem, ArtworkDetailSelection } from '../../artwork/types';
import type {
  AppTab,
  ArtworkDetailContext,
  CollectTab,
  NavigationHistoryState,
} from '../../lib/appNavigation';

type UseArtworkDetailPagerOptions = {
  activeTab: AppTab;
  collectTab: CollectTab;
  artworkDetailContext: ArtworkDetailContext | null;
  artworkDetailItem: ArtworkDetailItem | null;
  setArtworkDetailSelection: Dispatch<SetStateAction<ArtworkDetailSelection | null>>;
};

export function useArtworkDetailPager({
  activeTab,
  collectTab,
  artworkDetailContext,
  artworkDetailItem,
  setArtworkDetailSelection,
}: UseArtworkDetailPagerOptions) {
  const navigateArtworkDetail = useCallback((direction: 'prev' | 'next') => {
    if (!artworkDetailItem || !artworkDetailItem.navigationItems || artworkDetailItem.navigationItems.length <= 1) return;

    const allItems = artworkDetailItem.navigationItems;
    const currentIndex = allItems.findIndex((item) => item.id === artworkDetailItem.id);

    if (currentIndex === -1) return;

    const nextIndex = direction === 'next'
      ? (currentIndex + 1) % allItems.length
      : (currentIndex - 1 + allItems.length) % allItems.length;

    const nextItem = allItems[nextIndex];
    setArtworkDetailSelection({
      artworkId: nextItem.id,
      navigationItemIds: allItems.map((item) => item.id),
    });

    if (artworkDetailContext && window.history.state?.view === 'artwork') {
      window.history.replaceState(
        {
          view: 'artwork',
          artworkId: nextItem.id,
          artworkContext: artworkDetailContext,
          activeTab,
          collectTab,
        } satisfies NavigationHistoryState,
        '',
        artworkDetailContext.basePath,
      );
    }
  }, [activeTab, artworkDetailContext, artworkDetailItem, collectTab, setArtworkDetailSelection]);

  return {
    navigateArtworkDetail,
  };
}
