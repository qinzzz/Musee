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
  it('orders optimistic (no-seq) events by localOrder, never by createdAt', () => {
    const item = createItem('art-1');
    // createdAt deliberately inverted: the reply has the EARLIER createdAt.
    const inputEvent = createMessage({
      id: 'evt-input',
      role: 'user',
      text: 'look at this',
      artworkIds: ['art-1'],
      payload: { artworks: [{ artwork_id: 'art-1', source: 'library' }] },
      localOrder: 1,
      createdAt: 9999,
    });
    const reply = createMessage({
      id: 'evt-reply',
      role: 'model',
      type: 'model_response',
      text: 'nice',
      triggerEventId: 'evt-input',
      localOrder: 2,
      createdAt: 1,
      payload: { status: 'completed' },
    });

    const blocks = buildSessionRenderBlocks(createSummary([item]), {
      'session-1': [reply, inputEvent],
    });

    // createdAt would put the reply first (1 < 9999); localOrder keeps it last.
    expect(blocks.map((block) => block.id)).toEqual(['evt-input', 'evt-reply']);
  });

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

  it('renders deleted placeholders for artwork user input whose artworks no longer resolve', () => {
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
    expect(order).toEqual(['evt-upload', 'evt-upload-reply', 'evt-new']);
    expect(order[order.length - 1]).toBe('evt-new');
    expect(blocks[0]).toMatchObject({
      type: 'input',
      id: 'evt-upload',
      sourceLabel: 'Uploaded an artwork',
    });
    if (blocks[0].type !== 'input') {
      throw new Error('expected input block');
    }
    expect(blocks[0].items).toHaveLength(1);
    expect(blocks[0].items[0]).toMatchObject({
      id: 'deleted-artwork-missing-artwork',
      artworkId: 'missing-artwork',
      artworkName: 'Deleted artwork',
      isDeletedPlaceholder: true,
    });
  });

  it('does not mark unresolved artwork ids as deleted before artwork loading completes', () => {
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

    const blocks = buildSessionRenderBlocks(
      createSummary(),
      { 'session-1': [uploadReply, uploadInput] },
      { artworksLoaded: false },
    );

    expect(blocks.map((block) => block.id)).toEqual(['evt-upload-reply']);
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
