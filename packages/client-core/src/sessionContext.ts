export class SessionContextCancelledError extends Error {
  constructor() { super('Context preparation was cancelled.'); }
}

/** A resumable context preparation job. Input and durable data stay adapter-owned. */
export type ContextEntry<I, R> = {
  id: string;
  input: I;
  resolved?: R;
  status: 'queued' | 'resolving' | 'resolved' | 'enriching' | 'ready' | 'failed';
  failureStage?: 'resolve' | 'enrich';
  error?: unknown;
};

export type ContextHandler<I, R> = {
  resolve: (input: I, requestId: string) => Promise<R>;
  enrich: (resolved: R, input: I) => Promise<R>;
};

/** Handlers can dispatch a discriminated input union without widening it to any. */
export function createSessionContextJob<I, R, C>(
  inputs: Array<{ id: string; input: I }>,
  handler: ContextHandler<I, R>,
  commit: (resolved: R[]) => Promise<C>,
) {
  if (new Set(inputs.map(({ id }) => id)).size !== inputs.length) {
    throw new Error('Context entry IDs must be unique.');
  }
  let entries: ContextEntry<I, R>[] = inputs.map((entry) => ({ ...entry, status: 'queued' }));
  let committed: C | undefined;
  let didCommit = false;
  let running = false;
  let cancelled = false;
  const checkCancelled = () => { if (cancelled) throw new SessionContextCancelledError(); };
  const snapshot = () => entries.map((entry) => ({ ...entry }));

  return {
    snapshot,
    cancel: () => { cancelled = true; },
    async run(onChange: (entries: ContextEntry<I, R>[]) => void = () => {}, retryId?: string) {
      checkCancelled();
      if (running) throw new Error('Context preparation is already running.');
      running = true;
      const update = (index: number, patch: Partial<ContextEntry<I, R>>) => {
        entries[index] = { ...entries[index], ...patch };
        onChange(snapshot());
      };
      try {
        // Finish every resolve independently before committing one ordered turn.
        for (let index = 0; index < entries.length; index++) {
          checkCancelled();
          const entry = entries[index];
          if (entry.resolved !== undefined || (retryId && entry.id !== retryId)) continue;
          update(index, { status: 'resolving', error: undefined, failureStage: undefined });
          try {
            const resolved = await handler.resolve(entry.input, entry.id);
            update(index, { resolved, status: 'resolved' });
          } catch (error) {
            update(index, { status: 'failed', failureStage: 'resolve', error });
          }
        }
        checkCancelled();
        if (entries.some((entry) => entry.resolved === undefined)) {
          return { entries: snapshot(), committed, ready: false };
        }
        // Retrying an uncertain commit must use the same event/session IDs.
        if (!didCommit) {
          committed = await commit(entries.map((entry) => entry.resolved!));
          didCommit = true;
        }
        for (let index = 0; index < entries.length; index++) {
          checkCancelled();
          const entry = entries[index];
          if (entry.status === 'ready' || (retryId && entry.id !== retryId && entry.status === 'failed')) continue;
          update(index, { status: 'enriching', error: undefined, failureStage: undefined });
          try {
            const resolved = await handler.enrich(entry.resolved!, entry.input);
            update(index, { resolved, status: 'ready' });
          } catch (error) {
            update(index, { status: 'failed', failureStage: 'enrich', error });
          }
        }
        checkCancelled();
        return { entries: snapshot(), committed, ready: entries.every((entry) => entry.status === 'ready') };
      } finally {
        running = false;
      }
    },
  };
}

export type SessionArtworkContext = {
  artwork_id: string;
  source: 'capture' | 'upload' | 'library';
};

export function buildSessionArtworkContext(entries: SessionArtworkContext[]) {
  const seen = new Set<string>();
  const artworks = entries.filter((entry) => {
    if (!entry.artwork_id || seen.has(entry.artwork_id)) return false;
    seen.add(entry.artwork_id);
    return true;
  }).map((entry) => ({ ...entry }));
  return { artwork_ids: artworks.map((entry) => entry.artwork_id), payload: { artworks } };
}
