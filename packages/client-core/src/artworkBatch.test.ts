import { describe, expect, it, vi } from 'vitest';

import {
  retryArtworkBatchEntry,
  runArtworkBatch,
  type ArtworkBatchEntry,
} from './artworkBatch';

type Entry = ArtworkBatchEntry<string, string, string>;

const entries = (): Entry[] => [
  { id: 'one', input: 'one.jpg', status: 'queued' },
  { id: 'two', input: 'two.jpg', status: 'queued' },
];

describe('artwork batch', () => {
  it('uploads every entry before analyzing persisted entries', async () => {
    const calls: string[] = [];
    const result = await runArtworkBatch(entries(), {
      upload: async (input) => {
        calls.push(`upload:${input}`);
        return `saved:${input}`;
      },
      analyze: async (saved) => {
        calls.push(`analyze:${saved}`);
        return `analyzed:${saved}`;
      },
    });

    expect(calls).toEqual([
      'upload:one.jpg',
      'upload:two.jpg',
      'analyze:saved:one.jpg',
      'analyze:saved:two.jpg',
    ]);
    expect(result.map((entry) => entry.status)).toEqual(['complete', 'complete']);
  });

  it('preserves uploaded work when another upload or analysis fails', async () => {
    const result = await runArtworkBatch(entries(), {
      upload: async (input) => {
        if (input === 'two.jpg') throw new Error('offline');
        return `saved:${input}`;
      },
      analyze: async () => {
        throw new Error('model unavailable');
      },
    });

    expect(result[0]).toMatchObject({ status: 'analysis_failed', persisted: 'saved:one.jpg' });
    expect(result[1]).toMatchObject({ status: 'upload_failed' });
    expect(result[1]).not.toHaveProperty('persisted');
  });

  it('retries analysis without uploading the persisted entry again', async () => {
    const upload = vi.fn(async () => 'unexpected');
    const analyze = vi.fn(async () => 'analyzed');
    const result = await retryArtworkBatchEntry<Entry['input'], string, string>({
      id: 'one',
      input: 'one.jpg',
      persisted: 'saved:one.jpg',
      status: 'analysis_failed',
    }, { upload, analyze });

    expect(upload).not.toHaveBeenCalled();
    expect(analyze).toHaveBeenCalledWith('saved:one.jpg');
    expect(result).toMatchObject({ status: 'complete', result: 'analyzed' });
  });
});
