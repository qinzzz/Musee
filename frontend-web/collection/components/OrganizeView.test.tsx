import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import OrganizeView from './OrganizeView';
import type { ArtworkWorkspace, GalleryItem } from '../../types';

vi.mock('../../components/GridView', () => ({
  default: ({ items }: { items: Array<{ id: string }> }) => (
    <div data-testid="grid-view">{items.map((item) => item.id).join(',')}</div>
  ),
}));

vi.mock('../../components/CollectionGridSkeleton', () => ({
  default: () => <div data-testid="collection-grid-skeleton">skeleton</div>,
}));

vi.mock('../../artist/hooks/useUserArtists', () => ({
  buildArtistInvalidationKey: () => 'artists-key',
  useUserArtists: () => ({
    artists: [],
    isLoading: false,
    error: null,
  }),
}));

vi.mock('../../museum/hooks/useUserMuseums', () => ({
  useUserMuseums: () => ({
    museums: [],
    isLoading: false,
    error: null,
  }),
}));

function createItem(id: string): GalleryItem {
  return {
    id,
    artworkId: id,
    url: `https://example.com/${id}.jpg`,
    artistName: 'Artist',
    artworkName: `Artwork ${id}`,
    description: 'Description',
    keywords: [],
    timestamp: 1,
    sessionCapturedAt: 1,
    conversation: [],
    vibe: {
      backgroundColor: '#ffffff',
      padding: 4,
      borderRadius: '12px',
      borderType: 'solid',
      accentColor: '#000000',
    },
  };
}

const artworkWorkspace: ArtworkWorkspace = {
  id: 'visit-1',
  itemIds: [],
  globalConversation: [],
};

function renderOrganizeView(props: Partial<React.ComponentProps<typeof OrganizeView>> = {}) {
  return render(
    <OrganizeView
      onFileUpload={vi.fn()}
      artworksLoaded={true}
      items={[]}
      artworkWorkspace={artworkWorkspace}
      filteredSessionId={null}
      isAnalyzing={false}
      likedIds={new Set()}
      boards={[]}
      boardsLoading={false}
      userId="user-1"
      collectTab="saved"
      onCollectTabChange={vi.fn()}
      onCreateBoard={vi.fn()}
      onRenameBoard={vi.fn()}
      onDeleteBoard={vi.fn()}
      onAddItemsToBoard={vi.fn()}
      onDeleteArtworks={vi.fn().mockResolvedValue(undefined)}
      onOpenArtist={vi.fn()}
      onInterpret={vi.fn()}
      onDelete={vi.fn()}
      onStartUnsortedFlow={vi.fn()}
      {...props}
    />,
  );
}

describe('OrganizeView', () => {
  it('shows the skeleton on a cold start with no artworks', () => {
    renderOrganizeView({
      artworksLoaded: false,
      items: [],
    });

    expect(screen.getByTestId('collection-grid-skeleton')).toBeTruthy();
    expect(screen.queryByTestId('grid-view')).toBeNull();
  });

  it('shows cached artworks immediately while hydration is still in progress', () => {
    renderOrganizeView({
      artworksLoaded: false,
      items: [createItem('art-1')],
    });

    expect(screen.queryByTestId('collection-grid-skeleton')).toBeNull();
    expect(screen.getByTestId('grid-view').textContent).toContain('art-1');
  });
});
