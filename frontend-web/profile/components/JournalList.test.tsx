import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import JournalList from './JournalList';

describe('JournalList', () => {
  it('renders journals in the order provided with date, location, and reflection', () => {
    render(
      <JournalList
        journals={[
          {
            id: 'newer',
            local_date: '2026-07-21',
            location: 'Asian Art Museum',
            reflection: 'Something in the winter light held your attention.',
            representative_artworks: [
              {
                id: 'artwork-1',
                photo_uri: 'https://example.com/one.jpg',
                artwork_name: 'Winter Light',
                artist_name: 'Artist One',
              },
              {
                id: 'artwork-2',
                photo_uri: 'https://example.com/two.jpg',
                artwork_name: 'Snow Path',
                artist_name: 'Artist Two',
              },
            ],
          },
          {
            id: 'older',
            local_date: '2026-06-30',
            location: null,
            reflection: 'A quieter reflection.',
            representative_artworks: [],
          },
        ]}
      />,
    );

    const reflections = screen.getAllByText(/reflection|winter light/i);
    expect(reflections[0].textContent).toContain('winter light');
    expect(reflections[1].textContent).toContain('quieter reflection');
    expect(screen.getByText('July 21, 2026')).toBeTruthy();
    expect(screen.getByText('Asian Art Museum')).toBeTruthy();
    expect(screen.queryByText('Location not recorded')).toBeNull();
    expect(screen.getAllByRole('img')).toHaveLength(2);
    expect(screen.getByText('Your journal appears here overnight.')).toBeTruthy();

    fireEvent.error(screen.getAllByRole('img')[0]);
    expect(screen.getAllByRole('img')).toHaveLength(1);
  });

  it('shows the journal timing when the list is empty', () => {
    render(<JournalList journals={[]} />);

    expect(screen.getByText('Your journal appears here overnight.')).toBeTruthy();
  });

  it('renders deleted representative artwork metadata without an image', () => {
    render(
      <JournalList
        journals={[{
          id: 'deleted-journal',
          local_date: '2026-08-08',
          location: null,
          reflection: 'A remembered encounter.',
          representative_artworks: [{
            id: 'deleted-artwork',
            photo_uri: null,
            artwork_name: 'Remembered Work',
            artist_name: 'Remembered Artist',
            is_deleted: true,
          }],
        }]}
      />,
    );

    expect(screen.getByText('Remembered Work (deleted)')).toBeTruthy();
    expect(screen.getByText('Remembered Artist')).toBeTruthy();
    expect(screen.queryByText('Deleted')).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
  });
});
