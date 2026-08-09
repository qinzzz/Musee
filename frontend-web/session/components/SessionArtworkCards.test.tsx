import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GalleryItem } from '../../types';
import SessionArtworkCards from './SessionArtworkCards';

function makeArtwork(index: number, overrides: Partial<GalleryItem> = {}): GalleryItem {
  return {
    id: `art-${index}`,
    url: `https://example.com/art-${index}.jpg`,
    keywords: [],
    vibe: {
      backgroundColor: '#ffffff',
      padding: 4,
      borderRadius: '12px',
      borderType: 'solid',
      accentColor: '#000000',
    },
    timestamp: index,
    conversation: [],
    artworkName: `Artwork ${index}`,
    artistName: `Artist ${index}`,
    date: `200${index}`,
    ...overrides,
  };
}

describe('SessionArtworkCards', () => {
  it('renders a deterministic five-card composition with captions', () => {
    const items = Array.from({ length: 5 }, (_, index) => makeArtwork(index + 1));

    const { container } = render(
      <SessionArtworkCards items={items} onOpenArtwork={vi.fn()} />,
    );

    expect(container.querySelector('[data-artwork-count="5"]')?.classList.contains('session-artwork-composition--5')).toBe(true);
    expect(screen.getAllByRole('button')).toHaveLength(5);
    expect(screen.getByText('Artist 3 · 2003')).toBeTruthy();
    expect(screen.queryByText('5')).toBeNull();
  });

  it('uses visible metadata fallbacks and opens an available artwork', () => {
    const onOpenArtwork = vi.fn();
    const item = makeArtwork(1, { artworkName: '', artistName: '', date: undefined });

    render(<SessionArtworkCards items={[item]} onOpenArtwork={onOpenArtwork} />);

    expect(screen.getByText('Untitled')).toBeTruthy();
    expect(screen.getByText('Artist unknown')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open Untitled, Artist unknown' }));
    expect(onOpenArtwork).toHaveBeenCalledWith(item);
  });

  it('renders preserved metadata on a disabled deleted card', () => {
    const onOpenArtwork = vi.fn();
    const item = makeArtwork(1, {
      artworkName: 'Remembered Work',
      artistName: 'Remembered Artist',
      isDeletedPlaceholder: true,
      url: '',
    });

    render(<SessionArtworkCards items={[item]} onOpenArtwork={onOpenArtwork} />);

    expect(screen.getByText('Deleted artwork')).toBeTruthy();
    expect(screen.getByText('Remembered Work')).toBeTruthy();
    expect(screen.getByText('Remembered Artist · 2001')).toBeTruthy();
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button'));
    expect(onOpenArtwork).not.toHaveBeenCalled();
  });
});
