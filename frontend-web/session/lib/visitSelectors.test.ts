import { describe, expect, it } from 'vitest';
import { buildVisitSummaries } from './visitSelectors';
import type { GalleryItem } from '../../types';

function createItem(overrides: Partial<GalleryItem> = {}): GalleryItem {
  return {
    id: 'item-1',
    artworkId: 'artwork-1',
    url: 'https://example.com/1.jpg',
    keywords: [],
    vibe: {
      backgroundColor: '#fff',
      padding: 4,
      borderRadius: '12px',
      borderType: 'solid',
      accentColor: '#000',
    },
    timestamp: 100,
    sessionCapturedAt: 100,
    conversation: [],
    visitId: 'visit-1',
    artistName: 'Artist',
    artworkName: 'Work',
    syncStatus: 'synced',
    ...overrides,
  };
}

describe('buildVisitSummaries', () => {
  it('marks a session title as pending while persisted session titles are still hydrating', () => {
    const summaries = buildVisitSummaries({
      items: [createItem()],
      persistedSessions: [],
      persistedSessionsHydrated: false,
      visitDrafts: [],
      defaultVisitTitle: 'Untitled Session',
      visitSearch: '',
    });

    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      id: 'visit-1',
      title: 'Untitled Session',
      titlePending: true,
    });
  });

  it('stops marking the title as pending after persisted session hydration completes', () => {
    const summaries = buildVisitSummaries({
      items: [createItem()],
      persistedSessions: [],
      persistedSessionsHydrated: true,
      visitDrafts: [],
      defaultVisitTitle: 'Untitled Session',
      visitSearch: '',
    });

    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      id: 'visit-1',
      title: 'Untitled Session',
      titlePending: false,
    });
  });
});
