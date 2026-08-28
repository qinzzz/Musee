export type AppTab = 'newSession' | 'collect' | 'profile' | 'learn';

export type CollectTab = 'saved' | 'museums' | 'boards' | 'artists';

export type ArtistPageContext = {
  artistEntityId?: string;
  artworkId?: string;
  artistName?: string;
  parentLabel?: string;
  returnToArtworkId?: string;
  returnToArtworkContext?: ArtworkDetailContext;
};

export type ArtworkDetailContext = {
  parentLabel: string;
  basePath: string;
  returnToArtistContext?: ArtistPageContext;
};

export type NavigationHistoryState =
  | {
      view: 'root';
      activeTab: AppTab;
      collectTab: CollectTab;
    }
  | {
      view: 'artwork';
      artworkClientId: string;
      artworkContext: ArtworkDetailContext;
      activeTab: AppTab;
      collectTab: CollectTab;
    }
  | {
      view: 'artist';
      artistContext: ArtistPageContext;
      activeTab: AppTab;
      collectTab: CollectTab;
    }
  | {
      view: 'capture';
      activeTab: AppTab;
      collectTab: CollectTab;
    };

export type InitialNavigationState = {
  activeTab: AppTab;
  collectTab: CollectTab;
  learningInitialGuide: string | null;
  artistPageContext: ArtistPageContext | null;
};

export function getInitialNavigationState(pathname: string): InitialNavigationState {
  let activeTab: AppTab = 'newSession';
  let collectTab: CollectTab = 'saved';
  let artistPageContext: ArtistPageContext | null = null;

  if (pathname === '/profile') {
    activeTab = 'profile';
  } else if (pathname.startsWith('/learning')) {
    activeTab = 'learn';
  } else if (
    pathname === '/saved' ||
    pathname === '/museums' ||
    pathname === '/boards' ||
    pathname === '/artists' ||
    pathname.startsWith('/artists/')
  ) {
    activeTab = 'collect';
  }

  if (pathname === '/museums') {
    collectTab = 'museums';
  } else if (pathname === '/boards') {
    collectTab = 'boards';
  } else if (pathname === '/artists' || pathname.startsWith('/artists/')) {
    collectTab = 'artists';
  }

  if (pathname.startsWith('/artists/')) {
    const slug = pathname.slice('/artists/'.length);
    if (slug) {
      artistPageContext = { artistEntityId: slug, parentLabel: 'Artists' };
    }
  }

  return {
    activeTab,
    collectTab,
    learningInitialGuide: pathname.startsWith('/learning/')
      ? pathname.slice('/learning/'.length) || null
      : null,
    artistPageContext,
  };
}

export function stateToPath(tab: AppTab, collectTab: CollectTab): string {
  if (tab === 'profile') return '/profile';
  if (tab === 'learn') return '/learning';
  if (tab === 'collect') {
    if (collectTab === 'museums') return '/museums';
    if (collectTab === 'boards') return '/boards';
    if (collectTab === 'artists') return '/artists';
    return '/saved';
  }

  return '/';
}

export function slugifyName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '_');
}

export function buildRootHistoryState(
  activeTab: AppTab,
  collectTab: CollectTab,
): NavigationHistoryState {
  return {
    view: 'root',
    activeTab,
    collectTab,
  };
}

export function buildCaptureHistoryState(
  activeTab: AppTab,
  collectTab: CollectTab,
): NavigationHistoryState {
  return {
    view: 'capture',
    activeTab,
    collectTab,
  };
}
