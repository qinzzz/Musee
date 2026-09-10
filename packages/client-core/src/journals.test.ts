import { describe, expect, it, vi } from 'vitest';
import { createJournalService } from './journals';

describe('journal reads', () => {
  it('encodes the account and preserves saved order and full reflections', async () => {
    const items = ['2026-09-08', '2026-09-07'].map((local_date) => ({
      id: local_date, local_date, reflection: 'You noticed the light.\nA quieter moment.',
      location: null, representative_artworks: [],
    }));
    const fetchWithTimeout = vi.fn(async () => new Response(JSON.stringify({ items })));
    expect(await createJournalService({ fetchWithTimeout }, '/api').list('u&1')).toEqual(items);
    expect(fetchWithTimeout).toHaveBeenCalledWith('/api/journals?user_id=u%261', { timeout: 15000 });
  });

  it('distinguishes an empty account from malformed responses and failures', async () => {
    const fetchWithTimeout = vi.fn(async () => new Response('{"items":[]}'));
    const service = createJournalService({ fetchWithTimeout }, '/api');
    expect(await service.list('u')).toEqual([]);
    for (const payload of [{}, { items: [null] }, { items: [{ id: 'j' }] }]) {
      fetchWithTimeout.mockResolvedValueOnce(new Response(JSON.stringify(payload)));
      await expect(service.list('u')).rejects.toThrow('could not load journals');
    }
    fetchWithTimeout.mockResolvedValueOnce(new Response('', { status: 403 }));
    await expect(service.list('u')).rejects.toMatchObject({ status: 403 });
    fetchWithTimeout.mockRejectedValueOnce(new Error('offline'));
    await expect(service.list('u')).rejects.toThrow('offline');
  });
});
