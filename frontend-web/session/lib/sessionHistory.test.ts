import { describe, expect, it } from 'vitest';
import type { GalleryItem } from '../../types';
import type { SessionStreamMessage } from '../types';
import {
  getSessionHistoryBeforeTrigger,
  serializeSessionHistory,
  sortSessionHistory,
} from './sessionHistory';

const baseItem = {
  id: 'item-1',
  artworkId: 'art-1',
  artistName: 'Huang Gongwang',
  artworkName: 'Dwelling in the Fuchun Mountains',
  url: 'https://example.com/art.jpg',
  keywords: [],
  vibe: {
    backgroundColor: '#fff',
    padding: 0,
    borderRadius: '12px',
    borderType: 'solid',
    accentColor: '#000',
  },
  timestamp: 1,
  conversation: [],
} as GalleryItem;

describe('sessionHistory', () => {
  it('serializes messages in canonical session order', () => {
    const messages: SessionStreamMessage[] = [
      { id: 'evt-3', role: 'user', text: 'third', createdAt: 3000, sequenceNumber: 3 },
      { id: 'evt-1', role: 'user', text: 'first', createdAt: 1000, sequenceNumber: 1 },
      { id: 'evt-2', role: 'model', text: 'second', createdAt: 2000, sequenceNumber: 2 },
    ];

    expect(sortSessionHistory(messages).map((message) => message.id)).toEqual(['evt-1', 'evt-2', 'evt-3']);
    expect(serializeSessionHistory(messages, [baseItem]).map((message) => message.text)).toEqual([
      'first',
      'second',
      'third',
    ]);
  });

  it('keeps AI prompt history before the triggering event only', () => {
    const messages: SessionStreamMessage[] = [
      { id: 'evt-1', role: 'user', text: 'previous question', createdAt: 1000, sequenceNumber: 1 },
      { id: 'evt-2', role: 'model', text: 'previous answer', createdAt: 2000, sequenceNumber: 2 },
      { id: 'evt-3', role: 'user', text: 'current question', createdAt: 3000, sequenceNumber: 3 },
      { id: 'evt-4', role: 'user', text: 'later question', createdAt: 4000, sequenceNumber: 4 },
    ];

    expect(getSessionHistoryBeforeTrigger(messages, 'evt-3').map((message) => message.id)).toEqual([
      'evt-1',
      'evt-2',
    ]);
  });

  it('carries retrieved source IDs into follow-up planner history', () => {
    const messages: SessionStreamMessage[] = [{
      id: 'evt-1',
      role: 'model',
      text: 'You saved Woman with a Hat.',
      createdAt: 1000,
      payload: {
        status: 'completed',
        retrieval: { selected_source_ids: ['saved-art-1'] },
      },
    }];

    expect(serializeSessionHistory(messages, [])).toEqual([{
      role: 'model',
      text: 'You saved Woman with a Hat.',
      retrieval_source_ids: ['saved-art-1'],
    }]);
  });

  it('drops pending commentary linked to a missing trigger instead of echoing it back into context', () => {
    const messages: SessionStreamMessage[] = [
      { id: 'evt-1', role: 'user', text: 'previous question', createdAt: 1000, sequenceNumber: 1 },
      {
        id: 'commentary-1',
        role: 'model',
        text: 'pending response',
        type: 'artwork_commentary',
        triggerEventId: 'missing-trigger',
        createdAt: 2000,
        sequenceNumber: 2,
      },
    ];

    expect(getSessionHistoryBeforeTrigger(messages, 'missing-trigger').map((message) => message.id)).toEqual([
      'evt-1',
    ]);
  });

  it('serializes artwork-only user inputs so uploads remain visible in AI history', () => {
    const messages: SessionStreamMessage[] = [
      {
        id: 'evt-1',
        role: 'user',
        text: '',
        createdAt: 1000,
        sequenceNumber: 1,
        artworkIds: ['art-1'],
        payload: { artworks: [{ artwork_id: 'art-1', source: 'library' }] },
      },
    ];

    expect(serializeSessionHistory(messages, [baseItem])).toEqual([
      {
        role: 'user',
        text: 'I added "Dwelling in the Fuchun Mountains" by Huang Gongwang.',
      },
    ]);
  });
});
