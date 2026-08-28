import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { UserMuseumSummary } from '../../api/museums';
import type { GalleryItem } from '../../types';
import MuseumsSection from './MuseumsSection';

function artwork(id: string): GalleryItem {
  return {
    id,
    artworkId: id,
    url: `https://example.com/${id}.jpg`,
    artistName: 'Artist',
    artworkName: `Artwork ${id}`,
    keywords: [],
    timestamp: 1,
    conversation: [],
    vibe: { backgroundColor: '#fff', padding: 0, borderRadius: 'none', borderType: 'none', accentColor: '#000' },
  };
}

const getty: UserMuseumSummary = {
  museum: { id: 'getty', canonical_name: 'Getty Center' },
  artwork_count: 2,
  artwork_ids: ['art-2', 'art-1'],
  cover_artwork_ids: ['art-2', 'art-1'],
  first_recorded_on: '2025-09-05',
  last_recorded_on: '2025-09-06',
};

it('renders canonical museum cards and opens a URL-addressable museum selection', () => {
  const onSelectMuseum = vi.fn();
  render(
    <MuseumsSection
      museums={[getty]}
      museumsLoading={false}
      museumsError={null}
      normalizedCollectionSearch=""
      selectedMuseumId={null}
      items={[artwork('art-1'), artwork('art-2')]}
      onSelectMuseum={onSelectMuseum}
      onInterpret={vi.fn()}
    />,
  );

  expect(screen.getByText('Getty Center')).toBeTruthy();
  expect(screen.getByText('Sep 5, 2025 – Sep 6, 2025')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Getty Center/i }));
  expect(onSelectMuseum).toHaveBeenCalledWith('getty');
});

it('shows only artworks associated with the selected museum', () => {
  const onInterpret = vi.fn();
  render(
    <MuseumsSection
      museums={[getty]}
      museumsLoading={false}
      museumsError={null}
      normalizedCollectionSearch=""
      selectedMuseumId="getty"
      items={[artwork('art-1'), artwork('art-2'), artwork('other')]}
      onSelectMuseum={vi.fn()}
      onInterpret={onInterpret}
    />,
  );

  expect(screen.getByText('Artwork art-1')).toBeTruthy();
  expect(screen.getByText('Artwork art-2')).toBeTruthy();
  expect(screen.queryByText('Artwork other')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /Artwork art-2/i }));
  expect(onInterpret.mock.calls[0][1].basePath).toBe('/museums?museum=getty');
});
