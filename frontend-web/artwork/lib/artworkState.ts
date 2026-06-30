import type {
  ArtworkClientState,
  ArtworkRecord,
  GalleryItem,
} from '../../types';
import type { ArtworkDetailItem, ArtworkDetailSelection } from '../types';

const DEFAULT_CLIENT_STATE: ArtworkClientState = {
  syncStatus: 'synced',
};

export type ArtworkStatePatch = {
  record?: Partial<ArtworkRecord>;
  clientState?: Partial<ArtworkClientState>;
};

export function buildArtworkListItem(
  record: ArtworkRecord,
  clientState: ArtworkClientState = DEFAULT_CLIENT_STATE,
): GalleryItem {
  return {
    ...record,
    ...clientState,
  };
}

export function splitArtworkListItem(item: GalleryItem): {
  record: ArtworkRecord;
  clientState: ArtworkClientState;
} {
  const {
    isAnalyzing,
    streamingText,
    analysisStatus,
    analysisError,
    deleteStatus,
    syncStatus,
    isDeletedPlaceholder,
    ...record
  } = item;

  return {
    record,
    clientState: {
      isAnalyzing,
      streamingText,
      analysisStatus,
      analysisError,
      deleteStatus,
      syncStatus,
      isDeletedPlaceholder,
    },
  };
}

export function mergeArtworkState(
  item: GalleryItem,
  patch: ArtworkStatePatch,
): GalleryItem {
  const { record, clientState } = splitArtworkListItem(item);
  return buildArtworkListItem(
    {
      ...record,
      ...(patch.record || {}),
    },
    {
      ...clientState,
      ...(patch.clientState || {}),
    },
  );
}

export function updateArtworkInList(
  items: GalleryItem[],
  targetId: string,
  patch: ArtworkStatePatch,
): GalleryItem[] {
  return items.map((item) => {
    if (item.id !== targetId && item.artworkId !== targetId) return item;
    return mergeArtworkState(item, patch);
  });
}

export function isArtworkAnalyzing(item: Pick<ArtworkClientState, 'isAnalyzing' | 'analysisStatus'> | null | undefined): boolean {
  if (!item) return false;
  return Boolean(item.isAnalyzing || item.analysisStatus === 'pending' || item.analysisStatus === 'analyzing' || item.analysisStatus === 'reidentifying');
}

export function isArtworkPendingDelete(item: Pick<ArtworkClientState, 'deleteStatus'> | null | undefined): boolean {
  return item?.deleteStatus === 'pending';
}

export function getArtworkFailureMessage(
  item: Pick<ArtworkClientState, 'analysisStatus' | 'streamingText' | 'analysisError'> | null | undefined,
): string | undefined {
  if (!item || item.analysisStatus !== 'failed') return undefined;
  return item.streamingText || item.analysisError || 'Analysis failed.';
}

export function selectArtworkById(items: GalleryItem[], artworkId: string): GalleryItem | null {
  return items.find((item) => item.id === artworkId || item.artworkId === artworkId) || null;
}

export function resolveArtworkDetailItem(
  items: GalleryItem[],
  selection: ArtworkDetailSelection | null,
  resolveNavigationItems: (sourceItem: GalleryItem, items: GalleryItem[], navigationItemIds?: string[]) => GalleryItem[],
): ArtworkDetailItem | null {
  if (!selection) return null;

  const sourceItem = selectArtworkById(items, selection.artworkId);
  if (!sourceItem) return null;

  return {
    ...sourceItem,
    navigationItems: resolveNavigationItems(
      sourceItem,
      items,
      selection.navigationItemIds,
    ),
    is_liked: selection.is_liked,
  };
}
