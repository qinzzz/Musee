import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { InterpretingItem } from '../../artwork/types';
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
  interpretingItem: InterpretingItem | null;
  setInterpretingItem: Dispatch<SetStateAction<InterpretingItem | null>>;
};

export function useArtworkDetailPager({
  activeTab,
  collectTab,
  artworkDetailContext,
  interpretingItem,
  setInterpretingItem,
}: UseArtworkDetailPagerOptions) {
  const navigateInterpretation = useCallback((direction: 'prev' | 'next') => {
    if (!interpretingItem || !interpretingItem.allVisitItems || interpretingItem.allVisitItems.length <= 1) return;

    const allItems = interpretingItem.allVisitItems;
    const currentIndex = allItems.findIndex((item) => item.id === interpretingItem.id);

    if (currentIndex === -1) return;

    const nextIndex = direction === 'next'
      ? (currentIndex + 1) % allItems.length
      : (currentIndex - 1 + allItems.length) % allItems.length;

    const nextItem = allItems[nextIndex];
    setInterpretingItem({
      ...nextItem,
      allVisitItems: allItems,
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
  }, [activeTab, artworkDetailContext, collectTab, interpretingItem, setInterpretingItem]);

  return {
    navigateInterpretation,
  };
}
