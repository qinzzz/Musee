import { describe, expect, it } from 'vitest';
import { buildSessionSummaries } from './sessionSelectors';
import type { GalleryItem } from '../../types';
import type { SessionRecord } from '../api/sessions';

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

  it('does not use artwork location as a temporary title while persisted session titles are still hydrating', () => {
    const summaries = buildSessionSummaries({
      items: [createItem({
        location: JSON.stringify({ museum: 'Fallback Museum', city: 'New York' }),
      })],
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
      location: 'Fallback Museum, New York',
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

  it('prefers persisted session metadata over artwork-derived fallback data', () => {
    const persistedSessions: SessionRecord[] = [
      {
        id: 'session-1',
        user_id: 'user-1',
        title: 'MoMA Visit',
        updated_at: '2026-07-05T12:00:00Z',
      },
    ];

    const summaries = buildSessionSummaries({
      items: [createItem({
        location: JSON.stringify({ museum: 'Fallback Museum', city: 'New York' }),
      })],
      persistedSessions,
      persistedSessionsHydrated: true,
      sessionDrafts: [],
      defaultSessionTitle: 'Untitled Session',
      sessionSearch: '',
    });

    expect(summaries[0]).toMatchObject({
      id: 'session-1',
      title: 'MoMA Visit',
      artworkCount: 1,
      location: 'Fallback Museum, New York',
    });
  });
});
