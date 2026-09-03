import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ArtworkWorkspace, GalleryItem } from '../types';
import GridView from './GridView';

const item: GalleryItem = {
  id: 'art-1',
  artworkId: 'art-1',
  url: 'https://example.com/art.jpg',
  thumbnailUrl: 'https://example.com/art-thumbnail.jpg',
  artistName: 'Artist',
  artworkName: 'Artwork',
  description: 'Description',
  keywords: [],
  timestamp: 1,
  sessionCapturedAt: 1,
  conversation: [],
  vibe: {
    backgroundColor: '#fff',
    padding: 4,
    borderRadius: '12px',
    borderType: 'solid',
    accentColor: '#000',
  },
};

const artworkWorkspace: ArtworkWorkspace = {
  id: 'workspace-1',
  itemIds: [],
  globalConversation: [],
};

describe('GridView touch selection controls', () => {
  it('shows actions in normal mode and swaps to card-wide selection in selection mode', () => {
    const onToggleSelection = vi.fn();
    const { rerender } = render(
      <GridView
        items={[item]}
        artworkWorkspace={artworkWorkspace}
        filteredSessionId={null}
        isAnalyzing={false}
        selectedIds={[]}
        isSelectionMode={false}
        onToggleSelection={onToggleSelection}
        onInterpret={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Artwork actions' }).className).toContain('h-11');
    expect(screen.getByRole('checkbox', { name: 'Select artwork' }).className).toContain('hidden');
    expect(screen.getByRole('img', { name: 'Artwork' }).getAttribute('src')).toBe(
      'https://example.com/art-thumbnail.jpg',
    );

    rerender(
      <GridView
        items={[item]}
        artworkWorkspace={artworkWorkspace}
        filteredSessionId={null}
        isAnalyzing={false}
        selectedIds={[]}
        isSelectionMode={true}
        onToggleSelection={onToggleSelection}
        onInterpret={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Artwork actions' })).toBeNull();
    fireEvent.click(screen.getByTestId('artwork-card-art-1'));
    expect(onToggleSelection).toHaveBeenCalledWith('art-1');
  });
});
