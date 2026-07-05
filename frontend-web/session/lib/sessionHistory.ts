import type { GalleryItem } from '../../types';
import type { SessionStreamMessage } from '../types';
import { getPrimarySessionEventArtworkId, getSessionEventArtworkIds } from './sessionEventArtworks';
import { compareSessionEvents } from './sessionOrdering';
import { getArtworkClientId } from '../../lib/artworkIdentity';

const compareSessionHistoryOrder = compareSessionEvents;

export function sortSessionHistory(messages: SessionStreamMessage[]): SessionStreamMessage[] {
  return [...messages].sort(compareSessionHistoryOrder);
}

export function getSessionHistoryBeforeTrigger(
  messages: SessionStreamMessage[],
  triggerEventId?: string,
): SessionStreamMessage[] {
  const sortedMessages = sortSessionHistory(messages);
  if (!triggerEventId) {
    return sortedMessages;
  }

  const triggerMessage = sortedMessages.find((message) => message.id === triggerEventId);
  if (!triggerMessage) {
    return sortedMessages.filter((message) => message.triggerEventId !== triggerEventId);
  }

  return sortedMessages.filter((message) => compareSessionHistoryOrder(message, triggerMessage) < 0);
}

export function serializeSessionHistory(
  messages: SessionStreamMessage[],
  items: GalleryItem[],
): { role: 'user' | 'model'; text: string }[] {
  const byId = new Map<string, GalleryItem>();
  items.forEach((item) => {
    if (item.artworkId) byId.set(item.artworkId, item);
    byId.set(item.id, item);
    byId.set(getArtworkClientId(item), item);
  });

  const out: { role: 'user' | 'model'; text: string }[] = [];
  for (const message of sortSessionHistory(messages)) {
    if (message.type === 'artwork_capture') {
      const artworkId = getPrimarySessionEventArtworkId(message);
      const art = artworkId ? byId.get(artworkId) : undefined;
      const label = art
        ? `"${art.artworkName || 'an artwork'}" by ${art.artistName || 'an unknown artist'}`
        : 'an artwork';
      out.push({ role: 'user', text: `I captured ${label}.` });
    } else if (message.type === 'artwork_card') {
      const artworkId = getPrimarySessionEventArtworkId(message);
      const art = artworkId ? byId.get(artworkId) : undefined;
      if (!art) {
        out.push({ role: 'model', text: '[Deleted artwork]' });
        continue;
      }
      const bits: string[] = [`${art.artworkName || 'Untitled'} by ${art.artistName || 'Unknown Artist'}`];
      if (art.date) bits.push(`(${art.date})`);
      if (art.medium) bits.push(art.medium);
      let line = bits.join(' — ');
      if (art.description) line += `. ${art.description}`;
      out.push({ role: 'model', text: line });
    } else if (message.role === 'user') {
      if (message.text) {
        out.push({ role: 'user', text: message.text });
        continue;
      }

      const artworkIds = getSessionEventArtworkIds(message);
      if (artworkIds.length === 0) {
        continue;
      }

      const labels = artworkIds.map((artworkId) => {
        const art = byId.get(artworkId);
        return art
          ? `"${art.artworkName || 'an artwork'}" by ${art.artistName || 'an unknown artist'}`
          : 'an artwork';
      });
      out.push({
        role: 'user',
        text: labels.length === 1
          ? `I added ${labels[0]}.`
          : `I added ${labels.length} artworks: ${labels.join('; ')}.`,
      });
    } else if (message.text) {
      out.push({ role: message.role as 'user' | 'model', text: message.text });
    }
  }
  return out;
}
