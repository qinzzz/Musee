import { describe, expect, it } from 'vitest';
import type { GalleryItem } from '../../types';
import type { SessionStreamMessage, SessionSummary } from '../types';
import { buildSessionRenderBlocks } from './sessionRenderBlocks';

function createItem(id: string): GalleryItem {
  return {
    id,
    artworkId: id,
    url: `https://example.com/${id}.jpg`,
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
    sessionLinks: [{ sessionId: 'session-1', sequenceNumber: 1, source: 'library' }],
    conversation: [],
    artistName: 'Artist',
    artworkName: `Work ${id}`,
    syncStatus: 'synced',
  };
}

function createSummary(items: GalleryItem[] = []): SessionSummary {
  return {
    id: 'session-1',
    title: 'Session',
    location: null,
    artworkCount: items.length,
    updatedAt: 100,
    dateLabel: null,
    items,
  };
}

function createMessage(overrides: Partial<SessionStreamMessage>): SessionStreamMessage {
  return {
    id: 'message-1',
    role: 'user',
    text: '',
    createdAt: 100,
    ...overrides,
  };
}

describe('buildSessionRenderBlocks', () => {
  it('renders triggered commentary after its user input even when sequence numbers arrive out of order', () => {
    const userInput = createMessage({
      id: 'evt-user',
      role: 'user',
      text: 'what does slop mean',
      triggerEventId: 'evt-user',
      sequenceNumber: 4,
      createdAt: 400,
    });
    const commentary = createMessage({
      id: 'evt-commentary',
      role: 'model',
      type: 'artwork_commentary',
      text: 'In tech, slop means low-effort AI content.',
      triggerEventId: 'evt-user',
      sequenceNumber: 3,
      createdAt: 300,
      payload: { status: 'completed' },
    });

    const blocks = buildSessionRenderBlocks(createSummary(), {
      'session-1': [commentary, userInput],
    });

    expect(blocks.map((block) => block.id)).toEqual(['evt-user', 'evt-commentary']);
    expect(blocks[0].type).toBe('input');
    expect(blocks[1].type).toBe('commentary');
  });

  it('keeps artwork user input, its text, and triggered commentary together', () => {
    const itemA = createItem('artwork-a');
    const itemB = {
      ...createItem('artwork-b'),
      sessionLinks: [{ sessionId: 'session-1', sequenceNumber: 2, source: 'library' as const }],
    };
    const userInput = createMessage({
      id: 'evt-artworks',
      role: 'user',
      text: 'compare these works',
      triggerEventId: 'evt-artworks',
      artworkIds: ['artwork-a', 'artwork-b'],
      sequenceNumber: 2,
      createdAt: 200,
      payload: {
        artworks: [
          { artwork_id: 'artwork-a', source: 'library' },
          { artwork_id: 'artwork-b', source: 'library' },
        ],
      },
    });
    const commentary = createMessage({
      id: 'evt-commentary',
      role: 'model',
      type: 'artwork_commentary',
      text: 'They differ in texture and ceremony.',
      triggerEventId: 'evt-artworks',
      sequenceNumber: 1,
      createdAt: 100,
      payload: { status: 'completed' },
    });

    const blocks = buildSessionRenderBlocks(createSummary([itemA, itemB]), {
      'session-1': [commentary, userInput],
    });

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({
      type: 'input',
      id: 'evt-artworks',
      sourceLabel: 'Added 2 artworks from collection',
    });
    if (blocks[0].type !== 'input') {
      throw new Error('expected input block');
    }
    expect(blocks[0].items.map((item) => item.id)).toEqual(['artwork-a', 'artwork-b']);
    expect(blocks[0].userMessage?.text).toBe('compare these works');
    expect(blocks[1]).toMatchObject({ type: 'commentary', id: 'evt-commentary' });
  });
});
