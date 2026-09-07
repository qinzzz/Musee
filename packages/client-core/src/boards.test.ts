import { describe, expect, it, vi } from 'vitest';
import { createBoardService } from './boards';
import { ApiHttpError } from './health';

function setup(body: unknown = {}) {
  const fetchWithTimeout = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
  return { fetchWithTimeout, service: createBoardService({ fetchWithTimeout }, '/api') };
}
describe('board service', () => {
  it('maps canonical and legacy collection references without passing artwork bodies to UI', async () => {
    const { service } = setup([
      { id: '1', name: 'First', artwork_ids: ['a'], artworks: [{ id: 'wrong' }] },
      { id: '2', name: 'Second', artworks: [{ id: 'b', analysis: 'large' }] },
    ]);
    expect(await service.list('user')).toEqual([
      { id: '1', name: 'First', itemIds: ['a'], description: null },
      { id: '2', name: 'Second', itemIds: ['b'], description: null },
    ]);
  });
  it('sends membership changes without replacing unknown server membership', async () => {
    const { service, fetchWithTimeout } = setup({ id: 'b', name: 'Board', artwork_ids: ['a', 'b'] });
    await service.update('u&1', 'b/1', { addArtworkIds: ['b'], removeArtworkIds: ['c'] });
    expect(fetchWithTimeout.mock.calls[0]).toEqual(['/api/collections/b%2F1?user_id=u%261', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ add_artwork_ids: ['b'], remove_artwork_ids: ['c'] }),
    }]);
  });
  it('creates deduplicated membership and reads only the requested artwork page', async () => {
    const { service, fetchWithTimeout } = setup({ id: 'b', name: 'Board' });
    await service.create('user', ' Board ', ['a', 'a']);
    expect(fetchWithTimeout).toHaveBeenCalledWith('/api/collections', expect.objectContaining({
      body: JSON.stringify({ user_id: 'user', name: 'Board', artwork_ids: ['a'] }),
    }));
    await service.artworks('b', 30, 30);
    expect(fetchWithTimeout).toHaveBeenLastCalledWith('/api/collections/b/artworks?offset=30&limit=30', { method: 'GET' });
  });
  it('preserves HTTP status for permission and missing-board handling', async () => {
    const { service, fetchWithTimeout } = setup();
    fetchWithTimeout.mockResolvedValueOnce(new Response('', { status: 403 }));
    await expect(service.remove('user', 'b')).rejects.toMatchObject({ status: 403 });
    fetchWithTimeout.mockResolvedValueOnce(new Response('', { status: 404 }));
    await expect(service.get('missing')).rejects.toBeInstanceOf(ApiHttpError);
  });
});
