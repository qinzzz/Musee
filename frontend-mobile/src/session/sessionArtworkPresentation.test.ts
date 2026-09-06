import { describe, expect, it } from 'vitest';

import type { SessionEventRecord } from '@musee/client-core';

import type { MobileArtworkRecord } from '../library/types';
import {
  buildSessionArtworkPresentation,
  getSessionEventArtworkIds,
} from './sessionArtworkPresentation';

function artwork(id: string): MobileArtworkRecord {
  return {
    id,
    photoUri: `https://images.example/${id}.jpg`,
    thumbnailUri: `https://images.example/${id}-thumb.jpg`,
    resolvedImageUri: `https://images.example/${id}.jpg`,
    resolvedThumbnailUri: `https://images.example/${id}-thumb.jpg`,
    cacheKey: `artwork:${id}`,
    thumbnailCacheKey: `artwork-thumbnail:${id}`,
    artistName: 'Artist',
    artworkName: `Artwork ${id}`,
    analysis: null,
    analysisStatus: 'analyzed',
    analysisError: null,
    date: null,
    medium: null,
    movement: null,
    periodBucket: null,
    tags: [],
    isDeleted: false,
    createdAt: null,
  };
}

function event(
  id: string,
  eventType: SessionEventRecord['event_type'],
  artworkIds: string[],
): SessionEventRecord {
  return {
    id,
    role: eventType === 'user_input' ? 'user' : 'model',
    event_type: eventType,
    artwork_ids: artworkIds,
    payload: { artwork_ids: artworkIds },
  };
}

describe('session artwork presentation', () => {
  it('reads canonical artwork ids and legacy payload entries', () => {
    expect(getSessionEventArtworkIds(event('event-1', 'user_input', ['art-1']))).toEqual(['art-1']);
    expect(getSessionEventArtworkIds({
      id: 'event-2',
      role: 'user',
      event_type: 'user_input',
      payload: { artworks: [{ artwork_id: 'art-2', source: 'library' }] },
    })).toEqual(['art-2']);
  });

  it('presents an artwork at its first event without duplicating its result event', () => {
    const presentation = buildSessionArtworkPresentation([
      {
        ...event('input-1', 'user_input', ['art-1']),
        payload: { artworks: [{ artwork_id: 'art-1', source: 'library' }] },
      },
      event('result-1', 'artwork_result', ['art-1']),
    ], [artwork('art-1')]);

    expect(presentation.eventGroups['input-1']).toMatchObject({
      label: 'Added from library',
      artworks: [{ id: 'art-1' }],
    });
    expect(presentation.eventGroups['result-1']).toBeUndefined();
    expect(presentation.orphanGroup).toBeNull();
  });

  it('keeps unavailable references visible and groups unreferenced session artworks', () => {
    const presentation = buildSessionArtworkPresentation([
      event('result-1', 'artwork_result', ['missing-art']),
    ], [artwork('orphan-art')]);

    expect(presentation.eventGroups['result-1'].unavailableArtworks).toEqual([{
      id: 'missing-art',
      artworkName: null,
      artistName: null,
      date: null,
      isDeleted: false,
    }]);
    expect(presentation.orphanGroup?.artworks.map(({ id }) => id)).toEqual(['orphan-art']);
  });

  it('preserves a soft-deleted session artwork metadata in its placeholder', () => {
    const deletedArtwork = {
      ...artwork('deleted-art'),
      artworkName: 'Cones',
      artistName: 'Theaster Gates',
      date: '2014',
      isDeleted: true,
    };
    const presentation = buildSessionArtworkPresentation([
      event('input-1', 'user_input', ['deleted-art']),
    ], [deletedArtwork]);

    expect(presentation.eventGroups['input-1']).toMatchObject({
      artworks: [],
      unavailableArtworks: [{
        id: 'deleted-art',
        artworkName: 'Cones',
        artistName: 'Theaster Gates',
        date: '2014',
        isDeleted: true,
      }],
    });
    expect(presentation.orphanGroup).toBeNull();
  });

  it('uses the server deleted-artwork snapshot when the linked record is absent', () => {
    const deletedEvent = event('input-1', 'user_input', ['deleted-art']);
    deletedEvent.payload = {
      artwork_ids: ['deleted-art'],
      deleted_artworks: [{
        artwork_id: 'deleted-art',
        artwork_name: 'Cones',
        artist_name: 'Theaster Gates',
        date: '2014',
      }],
    };

    const presentation = buildSessionArtworkPresentation([deletedEvent], []);

    expect(presentation.eventGroups['input-1'].unavailableArtworks).toEqual([{
      id: 'deleted-art',
      artworkName: 'Cones',
      artistName: 'Theaster Gates',
      date: '2014',
      isDeleted: true,
    }]);
  });
});
