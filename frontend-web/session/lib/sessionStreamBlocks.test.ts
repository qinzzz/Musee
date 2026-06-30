import { describe, expect, it } from 'vitest';
import type { GalleryItem } from '../../types';
import type { ActiveSessionStreamEntry, SessionStreamMessage } from '../types';
import { buildGroupedSessionStream } from './sessionStreamBlocks';

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
    conversation: [],
    artistName: 'Artist',
    artworkName: `Work ${id}`,
    syncStatus: 'synced',
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

describe('buildGroupedSessionStream', () => {
  it('groups same-trigger artworks and user text into one input block', () => {
    const triggerEventId = 'evt-1';
    const stream: ActiveSessionStreamEntry[] = [
      {
        id: 'art-1',
        type: 'artwork',
        createdAt: 100,
        triggerEventId,
        item: createItem('art-1'),
      },
      {
        id: 'msg-1',
        type: 'message',
        createdAt: 101,
        triggerEventId,
        message: createMessage({
          id: 'msg-1',
          text: 'tell me about these artworks',
          triggerEventId,
          createdAt: 101,
        }),
      },
      {
        id: 'art-2',
        type: 'artwork',
        createdAt: 102,
        triggerEventId,
        item: createItem('art-2'),
      },
      {
        id: 'art-3',
        type: 'artwork',
        createdAt: 103,
        triggerEventId,
        item: createItem('art-3'),
      },
      {
        id: 'commentary-1',
        type: 'message',
        createdAt: 104,
        triggerEventId,
        message: createMessage({
          id: 'commentary-1',
          role: 'model',
          type: 'artwork_commentary',
          text: 'commentary',
          triggerEventId,
          createdAt: 104,
        }),
      },
    ];

    const grouped = buildGroupedSessionStream(stream);

    expect(grouped).toHaveLength(2);
    expect(grouped[0]).toMatchObject({
      type: 'input_group',
      triggerEventId,
    });
    if (grouped[0].type !== 'input_group') {
      throw new Error('expected input_group');
    }
    expect(grouped[0].items.map((item) => item.id)).toEqual(['art-1', 'art-2', 'art-3']);
    expect(grouped[0].userMessage?.text).toBe('tell me about these artworks');

    expect(grouped[1]).toMatchObject({
      type: 'message',
    });
  });

  it('re-sorts the grouped input block ahead of commentary when linked artworks are discovered later', () => {
    const triggerEventId = 'evt-2';
    const stream: ActiveSessionStreamEntry[] = [
      {
        id: 'commentary-2',
        type: 'message',
        createdAt: 102,
        triggerEventId,
        message: createMessage({
          id: 'commentary-2',
          role: 'model',
          type: 'artwork_commentary',
          text: 'commentary',
          triggerEventId,
          createdAt: 102,
        }),
      },
      {
        id: 'msg-2',
        type: 'message',
        createdAt: 100,
        triggerEventId,
        message: createMessage({
          id: 'msg-2',
          text: 'tell me about these artworks',
          triggerEventId,
          createdAt: 100,
        }),
      },
      {
        id: 'art-4',
        type: 'artwork',
        createdAt: 100,
        triggerEventId,
        item: createItem('art-4'),
      },
      {
        id: 'art-5',
        type: 'artwork',
        createdAt: 100,
        triggerEventId,
        item: createItem('art-5'),
      },
    ];

    const grouped = buildGroupedSessionStream(stream);

    expect(grouped).toHaveLength(2);
    expect(grouped[0].type).toBe('input_group');
    expect(grouped[1].type).toBe('message');
  });

  it('anchors grouped input ordering to the user_input event instead of artwork timestamps', () => {
    const triggerEventId = 'evt-3';
    const stream: ActiveSessionStreamEntry[] = [
      {
        id: 'art-old-1',
        type: 'artwork',
        createdAt: 10,
        triggerEventId,
        item: createItem('art-old-1'),
      },
      {
        id: 'art-old-2',
        type: 'artwork',
        createdAt: 11,
        triggerEventId,
        item: createItem('art-old-2'),
      },
      {
        id: 'commentary-3',
        type: 'message',
        createdAt: 110,
        triggerEventId,
        message: createMessage({
          id: 'commentary-3',
          role: 'model',
          type: 'artwork_commentary',
          text: 'commentary',
          triggerEventId,
          createdAt: 110,
        }),
      },
      {
        id: 'msg-3',
        type: 'message',
        createdAt: 100,
        triggerEventId,
        message: createMessage({
          id: 'msg-3',
          text: 'compare these works',
          triggerEventId,
          createdAt: 100,
        }),
      },
    ];

    const grouped = buildGroupedSessionStream(stream);

    expect(grouped).toHaveLength(2);
    expect(grouped[0].type).toBe('input_group');
    expect(grouped[0].createdAt).toBe(100);
    expect(grouped[1].type).toBe('message');
    expect(grouped[1].createdAt).toBe(110);
  });

  it('uses server sequence number as the canonical order when timestamps are misleading', () => {
    const triggerEventId = 'evt-4';
    const stream: ActiveSessionStreamEntry[] = [
      {
        id: 'commentary-4',
        type: 'message',
        createdAt: 100,
        triggerEventId,
        sequenceNumber: 2,
        message: createMessage({
          id: 'commentary-4',
          role: 'model',
          type: 'artwork_commentary',
          text: 'commentary',
          triggerEventId,
          createdAt: 100,
          sequenceNumber: 2,
        }),
      },
      {
        id: 'art-6',
        type: 'artwork',
        createdAt: 10,
        triggerEventId,
        sequenceNumber: 1,
        item: createItem('art-6'),
      },
      {
        id: 'msg-4',
        type: 'message',
        createdAt: 200,
        triggerEventId,
        sequenceNumber: 1,
        message: createMessage({
          id: 'msg-4',
          text: 'compare these works',
          triggerEventId,
          createdAt: 200,
          sequenceNumber: 1,
        }),
      },
    ];

    const grouped = buildGroupedSessionStream(stream);

    expect(grouped).toHaveLength(2);
    expect(grouped[0].type).toBe('input_group');
    expect(grouped[0].sequenceNumber).toBe(1);
    expect(grouped[1].type).toBe('message');
    expect(grouped[1].sequenceNumber).toBe(2);
  });

  it('keeps plain artwork rows separate when there is no grouped user input trigger', () => {
    const stream: ActiveSessionStreamEntry[] = [
      {
        id: 'art-1',
        type: 'artwork',
        createdAt: 100,
        item: createItem('art-1'),
      },
      {
        id: 'art-2',
        type: 'artwork',
        createdAt: 101,
        item: createItem('art-2'),
      },
    ];

    const grouped = buildGroupedSessionStream(stream);

    expect(grouped).toHaveLength(1);
    expect(grouped[0]).toMatchObject({ type: 'artwork_group' });
    if (grouped[0].type !== 'artwork_group') {
      throw new Error('expected artwork_group');
    }
    expect(grouped[0].items.map((item) => item.id)).toEqual(['art-1', 'art-2']);
  });
});
