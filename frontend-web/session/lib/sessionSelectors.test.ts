import { describe, expect, it } from 'vitest';
import { buildSessionSummaries } from './sessionSelectors';
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
    sessionLinks: [{ sessionId: 'session-1' }],
    artistName: 'Artist',
    artworkName: 'Work',
    syncStatus: 'synced',
    ...overrides,
  };
}

describe('buildSessionSummaries', () => {
  it('marks a session title as pending while persisted session titles are still hydrating', () => {
    const summaries = buildSessionSummaries({
      items: [createItem()],
      persistedSessions: [],
      persistedSessionsHydrated: false,
      sessionDrafts: [],
      defaultSessionTitle: 'Untitled Session',
      sessionSearch: '',
    });

    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      id: 'session-1',
      title: 'Untitled Session',
      titlePending: true,
    });
  });

  it('stops marking the title as pending after persisted session hydration completes', () => {
    const summaries = buildSessionSummaries({
      items: [createItem()],
      persistedSessions: [],
      persistedSessionsHydrated: true,
      sessionDrafts: [],
      defaultSessionTitle: 'Untitled Session',
      sessionSearch: '',
    });

    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      id: 'session-1',
      title: 'Untitled Session',
      titlePending: false,
    });
  });
});
