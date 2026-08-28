import type { ArtistRow } from '../../api/artworks';
import type { Board } from '../../boards/types';
import type { GalleryItem } from '../../types';
import type { CollectTab } from '../../lib/appNavigation';
import type { ActiveFilter } from '../types';

function normalizeSearch(query: string): string {
  return query.trim().toLowerCase();
}

export function matchesArtworkCollectionSearch(item: GalleryItem, query: string): boolean {
  const normalizedQuery = normalizeSearch(query);
  if (!normalizedQuery) return true;

  const haystacks = [
    item.artworkName,
    item.artistName,
    item.location?.museum_name,
    item.location?.institution_name,
    item.location?.city,
    item.movement,
    item.medium,
    ...(item.keywords || []),
  ].filter(Boolean) as string[];

  return haystacks.some((value) => value.toLowerCase().includes(normalizedQuery));
}

export function filterArtworksByCollectionSearch(items: GalleryItem[], query: string): GalleryItem[] {
  return items.filter((item) => matchesArtworkCollectionSearch(item, query));
}

export function groupArtworksByMonth(items: GalleryItem[]): Array<{ label: string; items: GalleryItem[] }> {
  const groups = new Map<string, GalleryItem[]>();

  [...items]
    .sort((a, b) => b.timestamp - a.timestamp)
    .forEach((item) => {
      const date = new Date(item.timestamp);
      const key = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    });

  return Array.from(groups.entries()).map(([label, groupedItems]) => ({ label, items: groupedItems }));
}

export function filterBoardsBySearch(boards: Board[], query: string): Board[] {
  const normalizedQuery = normalizeSearch(query);
  if (!normalizedQuery) return boards;
  return boards.filter((board) => board.name.toLowerCase().includes(normalizedQuery));
}

export function filterArtistsBySearch(artists: ArtistRow[], query: string): ArtistRow[] {
  const normalizedQuery = normalizeSearch(query);
  if (!normalizedQuery) return artists;

  return artists.filter((artist) =>
    [artist.display_name, artist.nationality]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(normalizedQuery)),
  );
}

export function getCollectionSearchPlaceholder(
  collectTab: CollectTab,
  selectedBoard: 'liked' | string | null,
  boardDetailName: string,
): string {
  if (collectTab === 'saved') {
    return selectedBoard ? `Search ${boardDetailName || 'board'}` : 'Search artworks';
  }
  if (collectTab === 'boards') {
    return selectedBoard ? `Search ${boardDetailName || 'board'}` : 'Search boards';
  }
  if (collectTab === 'museums') return 'Search museums';
  return 'Search artists';
}

export function getSavedContextLabel(activeFilter: ActiveFilter): string {
  if (activeFilter === 'all') return 'All Artworks';
  if (activeFilter === 'love') return 'Loved';
  if (activeFilter === 'respect') return 'Respect';
  if (activeFilter === 'not_for_me') return 'Not for Me';
  return 'Unsorted';
}

export function getBoardCoverImages(itemIds: string[], items: GalleryItem[]): string[] {
  return itemIds
    .slice(0, 4)
    .map((id) => items.find((item) => item.id === id)?.url)
    .filter(Boolean) as string[];
}

export function getBoardArtworkCount(itemIds: string[], items: GalleryItem[]): number {
  return itemIds.filter((id) => items.some((item) => item.id === id)).length;
}
