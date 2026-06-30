/**
 * Canonical ordering for session events.
 *
 * `sequence_number` (assigned by the DB in insert order) is the single source
 * of truth. Optimistic events that haven't been persisted/refetched yet have
 * no sequence_number; they are ordered by a monotonic client-side creation
 * counter (`localOrder`) — i.e. the order the client created them, which is the
 * order the DB will number them. `createdAt` is NOT used for ordering (it's a
 * wall-clock display value and is unreliable: timezone skew, same-millisecond
 * ties, client/server drift).
 */

let localOrderCounter = 0;

/** Strictly increasing per client session — the order events are created in. */
export function nextLocalOrder(): number {
  localOrderCounter += 1;
  return localOrderCounter;
}

type Orderable = { sequenceNumber?: number; localOrder?: number; id: string };

export function compareSessionEvents(a: Orderable, b: Orderable): number {
  const aHasSeq = typeof a.sequenceNumber === 'number';
  const bHasSeq = typeof b.sequenceNumber === 'number';

  // Both persisted: order by the authoritative DB sequence_number.
  if (aHasSeq && bHasSeq && a.sequenceNumber !== b.sequenceNumber) {
    return (a.sequenceNumber as number) - (b.sequenceNumber as number);
  }
  // Persisted always before not-yet-persisted (optimistic) events.
  if (aHasSeq && !bHasSeq) return -1;
  if (!aHasSeq && bHasSeq) return 1;

  // Neither persisted yet: order by client creation order.
  const aOrder = a.localOrder ?? 0;
  const bOrder = b.localOrder ?? 0;
  if (aOrder !== bOrder) return aOrder - bOrder;

  return a.id.localeCompare(b.id);
}
