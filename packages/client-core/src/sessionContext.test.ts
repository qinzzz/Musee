import { describe, expect, it, vi } from 'vitest';
import { buildSessionArtworkContext, createSessionContextJob } from './sessionContext';

describe('session context pipeline', () => {
  it('resolves heterogeneous inputs in order, commits once, then enriches', async () => {
    type Input = { kind: 'document'; uri: string } | { kind: 'artist'; id: string };
    const calls: string[] = [];
    const job = createSessionContextJob<Input, string, string>([
      { id: 'one', input: { kind: 'document', uri: 'local.pdf' } },
      { id: 'two', input: { kind: 'artist', id: 'artist-1' } },
    ], {
      resolve: async (input) => { calls.push(input.kind); return input.kind; },
      enrich: async (ref) => { calls.push(`enrich:${ref}`); return ref; },
    }, async (refs) => { calls.push(`commit:${refs.join(',')}`); return 'turn'; });
    expect((await job.run()).ready).toBe(true);
    await job.run();
    expect(calls).toEqual(['document', 'artist', 'commit:document,artist', 'enrich:document', 'enrich:artist']);
  });

  it('retains successful resolutions and retries only the failed entry', async () => {
    let fail = true;
    const resolve = vi.fn(async (input: string) => {
      if (input === 'two' && fail) throw new Error('offline');
      return input;
    });
    const commit = vi.fn(async () => 'turn');
    const job = createSessionContextJob([{ id: '1', input: 'one' }, { id: '2', input: 'two' }], {
      resolve, enrich: async (ref) => ref,
    }, commit);
    expect((await job.run()).ready).toBe(false);
    expect(commit).not.toHaveBeenCalled();
    fail = false;
    expect((await job.run(undefined, '2')).ready).toBe(true);
    expect(resolve.mock.calls.map(([input]) => input)).toEqual(['one', 'two', 'two']);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('does not repeat commit or successful enrichment on an enrichment retry', async () => {
    const enrich = vi.fn().mockResolvedValueOnce('one').mockRejectedValueOnce(new Error('model')).mockResolvedValueOnce('two');
    const commit = vi.fn(async () => 'turn');
    const job = createSessionContextJob([{ id: '1', input: 'one' }, { id: '2', input: 'two' }], {
      resolve: async (input) => input, enrich,
    }, commit);
    expect((await job.run()).ready).toBe(false);
    expect((await job.run(undefined, '2')).ready).toBe(true);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(enrich.mock.calls.map(([ref]) => ref)).toEqual(['one', 'two', 'two']);
  });

  it('retries an uncertain commit without repeating resolution', async () => {
    const resolve = vi.fn(async () => 'saved');
    const commit = vi.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce('turn');
    const job = createSessionContextJob([{ id: '1', input: 'photo' }], { resolve, enrich: async (ref) => ref }, commit);
    await expect(job.run()).rejects.toThrow('timeout');
    expect((await job.run()).ready).toBe(true);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenNthCalledWith(1, ['saved']);
    expect(commit).toHaveBeenNthCalledWith(2, ['saved']);
  });

  it('rejects overlapping runs', async () => {
    let release!: (value: string) => void;
    const job = createSessionContextJob([{ id: '1', input: 'photo' }], {
      resolve: () => new Promise<string>((resolve) => { release = resolve; }), enrich: async (ref) => ref,
    }, async () => 'turn');
    const running = job.run();
    await expect(job.run()).rejects.toThrow('already running');
    release('saved');
    await running;
  });

  it('stops before commit when cancelled during an upload', async () => {
    let release!: (value: string) => void;
    const commit = vi.fn(async () => 'turn');
    const enrich = vi.fn(async (ref: string) => ref);
    const job = createSessionContextJob([{ id: '1', input: 'photo' }], {
      resolve: () => new Promise<string>((resolve) => { release = resolve; }), enrich,
    }, commit);
    const running = job.run();
    job.cancel();
    release('saved');
    await expect(running).rejects.toThrow('cancelled');
    expect(commit).not.toHaveBeenCalled();
    expect(enrich).not.toHaveBeenCalled();
    await expect(job.run()).rejects.toThrow('cancelled');
  });

  it('commits only once even when the adapter returns no value', async () => {
    const commit = vi.fn(async () => {});
    const job = createSessionContextJob([{ id: '1', input: 'photo' }], {
      resolve: async (input) => input, enrich: async (ref) => ref,
    }, commit);
    await job.run();
    await job.run();
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('deduplicates artwork references without losing source or order', () => {
    expect(buildSessionArtworkContext([
      { artwork_id: 'b', source: 'library' }, { artwork_id: 'a', source: 'capture' },
      { artwork_id: 'b', source: 'upload' },
    ])).toEqual({ artwork_ids: ['b', 'a'], payload: { artworks: [
      { artwork_id: 'b', source: 'library' }, { artwork_id: 'a', source: 'capture' },
    ] } });
  });
});
