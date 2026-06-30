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
  it('orders events by sequence_number (reply after its trigger)', () => {
    const userInput = createMessage({
      id: 'evt-user',
      role: 'user',
      text: 'what does slop mean',
      triggerEventId: 'evt-user',
      sequenceNumber: 3,
      createdAt: 300,
    });
    const commentary = createMessage({
      id: 'evt-commentary',
      role: 'model',
      type: 'artwork_commentary',
      text: 'In tech, slop means low-effort AI content.',
      triggerEventId: 'evt-user',
      sequenceNumber: 4,
      createdAt: 400,
      payload: { status: 'completed' },
    });

    // Provided out of array order; the builder must order by sequence_number.
    const blocks = buildSessionRenderBlocks(createSummary(), {
      'session-1': [commentary, userInput],
    });

    expect(blocks.map((block) => block.id)).toEqual(['evt-user', 'evt-commentary']);
    // A text-only user message is a plain message bubble, not an artwork "input" block.
    expect(blocks[0].type).toBe('message');
    expect(blocks[1].type).toBe('commentary');
  });

  it('keeps a reply at its sequence position even when its trigger renders no block, and a new (unsaved) message stays last', () => {
    // An upload user_input whose artworks do not resolve to items → produces no
    // input block. Its reply must still render at its seq position, and a
    // brand-new optimistic message (no sequence_number) must remain at the bottom.
    const uploadInput = createMessage({
      id: 'evt-upload',
      role: 'user',
      text: '',
      triggerEventId: 'evt-upload',
      artworkIds: ['missing-artwork'],
      sequenceNumber: 1,
      createdAt: 100,
      payload: { artworks: [{ artwork_id: 'missing-artwork', source: 'upload' }] },
    });
    const uploadReply = createMessage({
      id: 'evt-upload-reply',
      role: 'model',
      type: 'artwork_commentary',
      text: 'reply about the upload',
      triggerEventId: 'evt-upload',
      sequenceNumber: 2,
      createdAt: 200,
      payload: { status: 'completed' },
    });
    const newMessage = createMessage({
      id: 'evt-new',
      role: 'user',
      text: 'NEW MESSAGE',
      triggerEventId: 'evt-new',
      createdAt: 999, // optimistic: no sequenceNumber yet
    });

    const blocks = buildSessionRenderBlocks(createSummary(), {
      'session-1': [uploadReply, uploadInput, newMessage],
    });

    const order = blocks.map((block) => block.id);
    expect(order).toEqual(['evt-upload-reply', 'evt-new']);
    expect(order[order.length - 1]).toBe('evt-new');
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
      sequenceNumber: 1,
      createdAt: 100,
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
      sequenceNumber: 2,
      createdAt: 200,
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
