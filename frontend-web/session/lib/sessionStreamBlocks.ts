import type { GalleryItem } from '../../types';
import type { ActiveSessionStreamEntry, SessionStreamMessage } from '../types';

export type GroupedSessionStreamEntry =
  | {
      type: 'input_group';
      id: string;
      createdAt: number;
      sequenceNumber?: number;
      triggerEventId: string;
      items: GalleryItem[];
      userMessage?: SessionStreamMessage;
    }
  | {
      type: 'artwork_group';
      id: string;
      createdAt: number;
      sequenceNumber?: number;
      triggerEventId?: string;
      items: GalleryItem[];
    }
  | {
      type: 'message';
      id: string;
      createdAt: number;
      sequenceNumber?: number;
      message: SessionStreamMessage;
    };

type PendingInputGroup = {
  triggerEventId: string;
  earliestArtworkCreatedAt: number;
  lowestSequenceNumber?: number;
  items: GalleryItem[];
  userMessage?: SessionStreamMessage;
};

export function buildGroupedSessionStream(
  activeSessionStream: ActiveSessionStreamEntry[],
): GroupedSessionStreamEntry[] {
  const artworkCountByTrigger = new Map<string, number>();
  for (const entry of activeSessionStream) {
    if (entry.type === 'artwork' && entry.triggerEventId) {
      artworkCountByTrigger.set(entry.triggerEventId, (artworkCountByTrigger.get(entry.triggerEventId) || 0) + 1);
    }
  }

  const pendingByTrigger = new Map<string, PendingInputGroup>();
  const emittedTriggerIds = new Set<string>();
  const grouped: Array<GroupedSessionStreamEntry & { _order: number }> = [];

  const getOrCreateInputGroup = (
    triggerEventId: string,
    createdAt: number,
    sequenceNumber?: number,
  ): PendingInputGroup => {
    const existing = pendingByTrigger.get(triggerEventId);
    if (existing) {
      existing.earliestArtworkCreatedAt = Math.min(existing.earliestArtworkCreatedAt, createdAt);
      if (typeof sequenceNumber === 'number') {
        existing.lowestSequenceNumber = typeof existing.lowestSequenceNumber === 'number'
          ? Math.min(existing.lowestSequenceNumber, sequenceNumber)
          : sequenceNumber;
      }
      return existing;
    }
    const next: PendingInputGroup = {
      triggerEventId,
      earliestArtworkCreatedAt: createdAt,
      lowestSequenceNumber: sequenceNumber,
      items: [],
    };
    pendingByTrigger.set(triggerEventId, next);
    return next;
  };

  activeSessionStream.forEach((entry) => {
    if (entry.type === 'artwork' && entry.triggerEventId) {
      const inputGroup = getOrCreateInputGroup(entry.triggerEventId, entry.createdAt, entry.sequenceNumber);
      inputGroup.items.push(entry.item);
      if (!emittedTriggerIds.has(entry.triggerEventId)) {
        emittedTriggerIds.add(entry.triggerEventId);
        grouped.push({
          type: 'input_group',
          id: `input-group-${entry.triggerEventId}`,
          createdAt: inputGroup.earliestArtworkCreatedAt,
          sequenceNumber: inputGroup.lowestSequenceNumber,
          triggerEventId: entry.triggerEventId,
          items: inputGroup.items,
          userMessage: inputGroup.userMessage,
          _order: grouped.length,
        });
      }
      return;
    }

    if (
      entry.type === 'message'
      && entry.message.role === 'user'
      && entry.triggerEventId
      && (artworkCountByTrigger.get(entry.triggerEventId) || 0) > 0
    ) {
      const inputGroup = getOrCreateInputGroup(entry.triggerEventId, entry.createdAt, entry.sequenceNumber);
      inputGroup.userMessage = entry.message;
      if (!emittedTriggerIds.has(entry.triggerEventId)) {
        emittedTriggerIds.add(entry.triggerEventId);
        grouped.push({
          type: 'input_group',
          id: `input-group-${entry.triggerEventId}`,
          createdAt: entry.message.createdAt,
          sequenceNumber: entry.message.sequenceNumber ?? inputGroup.lowestSequenceNumber,
          triggerEventId: entry.triggerEventId,
          items: inputGroup.items,
          userMessage: inputGroup.userMessage,
          _order: grouped.length,
        });
      }
      return;
    }

    if (entry.type === 'artwork') {
      const previous = grouped[grouped.length - 1];
      if (previous?.type === 'artwork_group' && previous.triggerEventId === entry.triggerEventId) {
        previous.items.push(entry.item);
        return;
      }

      grouped.push({
        type: 'artwork_group',
        id: `artwork-group-${entry.id}`,
        createdAt: entry.createdAt,
        sequenceNumber: entry.sequenceNumber,
        triggerEventId: entry.triggerEventId,
        items: [entry.item],
        _order: grouped.length,
      });
      return;
    }

    grouped.push({
      type: 'message',
      id: entry.id,
      createdAt: entry.createdAt,
      sequenceNumber: entry.sequenceNumber ?? entry.message.sequenceNumber,
      message: entry.message,
      _order: grouped.length,
    });
  });

  return grouped
    .map((entry) => {
      if (entry.type !== 'input_group') {
        return entry;
      }
      const resolved = pendingByTrigger.get(entry.triggerEventId);
      if (!resolved) {
        return entry;
      }
      return {
        ...entry,
        createdAt: resolved.userMessage?.createdAt ?? resolved.earliestArtworkCreatedAt,
        sequenceNumber: resolved.userMessage?.sequenceNumber ?? resolved.lowestSequenceNumber,
        items: resolved.items,
        userMessage: resolved.userMessage,
      };
    })
    .sort((a, b) => {
      if (
        typeof a.sequenceNumber === 'number'
        && typeof b.sequenceNumber === 'number'
        && a.sequenceNumber !== b.sequenceNumber
      ) {
        return a.sequenceNumber - b.sequenceNumber;
      }
      if (a.createdAt !== b.createdAt) {
        return a.createdAt - b.createdAt;
      }
      return a._order - b._order;
    })
    .map(({ _order: _discardedOrder, ...entry }) => entry);
}
