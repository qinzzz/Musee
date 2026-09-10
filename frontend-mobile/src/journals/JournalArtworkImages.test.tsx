// @vitest-environment jsdom
import { createElement, type PropsWithChildren } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../api/runtime', () => ({ MOBILE_API_BASE_URL: 'https://backend.example/api' }));
vi.mock('react-native', () => ({
  StyleSheet: { create: (styles: unknown) => styles },
  View: ({ children, accessibilityLabel }: PropsWithChildren<{ accessibilityLabel?: string }>) =>
    createElement('div', { 'aria-label': accessibilityLabel }, children),
  Text: ({ children }: PropsWithChildren) => createElement('span', {}, children),
}));
vi.mock('expo-image', () => ({
  Image: ({ source, accessibilityLabel, onError }: {
    source: { uri: string }; accessibilityLabel: string; onError: () => void;
  }) => createElement('img', { src: source.uri, alt: accessibilityLabel, onError }),
}));
import { JournalArtworkImages } from './JournalArtworkImages';

afterEach(cleanup);
const artwork = (id: string) => ({ id, photo_uri: `/uploads/${id}.jpg`, artwork_name: `Work ${id}`, artist_name: 'Artist' });

it('renders at most two resolved images and hides failed images', () => {
  render(<JournalArtworkImages artworks={[artwork('a'), artwork('b')]} />);
  expect(screen.getAllByRole('img')).toHaveLength(2);
  expect(screen.getByAltText('Work a by Artist').getAttribute('src')).toBe('https://backend.example/uploads/a.jpg');
  fireEvent.error(screen.getByAltText('Work a by Artist'));
  expect(screen.getAllByRole('img')).toHaveLength(1);
  fireEvent.error(screen.getByAltText('Work b by Artist'));
  expect(screen.queryByRole('img')).toBeNull();
});

it('preserves deleted and missing artwork metadata without loading their images', () => {
  render(<JournalArtworkImages artworks={[
    { ...artwork('a'), is_deleted: true },
    { ...artwork('b'), photo_uri: null, artwork_name: '', artist_name: '' },
  ]} />);
  expect(screen.getByText('Work a (deleted)')).toBeTruthy();
  expect(screen.getByText('Untitled artwork (image unavailable)')).toBeTruthy();
  expect(screen.getByText('Artist unknown')).toBeTruthy();
  expect(screen.queryByRole('img')).toBeNull();
});

it('caps artwork previews and permits a changed image URL after a failure', () => {
  const view = render(<JournalArtworkImages artworks={[artwork('a'), artwork('b'), artwork('c')]} />);
  expect(screen.getAllByRole('img')).toHaveLength(2);
  fireEvent.error(screen.getByAltText('Work a by Artist'));
  view.rerender(<JournalArtworkImages artworks={[{ ...artwork('a'), photo_uri: '/uploads/repaired.jpg' }]} />);
  expect(screen.getByAltText('Work a by Artist').getAttribute('src')).toContain('repaired.jpg');
  view.rerender(<JournalArtworkImages artworks={[]} />);
  expect(screen.queryByRole('img')).toBeNull();
});
