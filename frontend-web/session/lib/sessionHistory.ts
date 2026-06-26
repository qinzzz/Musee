import type { GalleryItem } from '../../types';
import type { SessionStreamMessage } from '../types';

export function serializeSessionHistory(
  messages: SessionStreamMessage[],
  items: GalleryItem[],
): { role: 'user' | 'model'; text: string }[] {
  const byId = new Map<string, GalleryItem>();
  items.forEach((item) => {
    if (item.artworkId) byId.set(item.artworkId, item);
    byId.set(item.id, item);
  });

  const out: { role: 'user' | 'model'; text: string }[] = [];
  for (const message of messages) {
    if (message.type === 'artwork_capture') {
      const art = message.artworkId ? byId.get(message.artworkId) : undefined;
      const label = art
        ? `"${art.artworkName || 'an artwork'}" by ${art.artistName || 'an unknown artist'}`
        : 'an artwork';
      out.push({ role: 'user', text: `I captured ${label}.` });
    } else if (message.type === 'artwork_card') {
      const art = message.artworkId ? byId.get(message.artworkId) : undefined;
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
    } else if (message.text) {
      out.push({ role: message.role as 'user' | 'model', text: message.text });
    }
  }
  return out;
}
