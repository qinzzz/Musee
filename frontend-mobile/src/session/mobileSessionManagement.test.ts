import { describe, expect, it, vi } from 'vitest';
import { createMobileSessionManagement } from './mobileSessionManagement';

const session = { id: 's/1', user_id: 'u&1', title: 'Old' };
describe('Session management', () => {
  it('saves title and goal through the canonical endpoints and retains metadata', async () => {
    const fetchWithTimeout = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ session: { ...session, title: 'New', metadata: { preserved: true } } })))
      .mockResolvedValueOnce(new Response('{"ok":true}'));
    const result = await createMobileSessionManagement({ fetchWithTimeout }, '/api').save(session, 'u&1', ' New ', ' Color ');
    expect(fetchWithTimeout.mock.calls[0]).toEqual(['/api/sessions/s%2F1?user_id=u%261', expect.objectContaining({ method: 'PUT', body: '{"title":"New"}' })]);
    expect(fetchWithTimeout.mock.calls[1]).toEqual(['/api/sessions/s%2F1/goal', expect.objectContaining({ method: 'PATCH', body: '{"goal":"Color"}' })]);
    expect(result.metadata).toEqual({ preserved: true, user_goal: 'Color' });
  });
  it('reports partial-save failures so the form stays open for retry', async () => {
    const fetchWithTimeout = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ session })))
      .mockResolvedValueOnce(new Response('', { status: 500 }));
    await expect(createMobileSessionManagement({ fetchWithTimeout }, '/api').save(session, 'u', 'New', 'Goal')).rejects.toMatchObject({ status: 500 });
  });
  it('treats already-deleted sessions as success but preserves authorization failures', async () => {
    const fetchWithTimeout = vi.fn().mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(new Response('', { status: 403 }));
    const service = createMobileSessionManagement({ fetchWithTimeout }, '/api');
    await expect(service.remove('s/1', 'u&1')).resolves.toBeUndefined();
    expect(fetchWithTimeout.mock.calls[0]).toEqual(['/api/sessions/s%2F1?user_id=u%261', { method: 'DELETE' }]);
    await expect(service.remove('s/1', 'u&1')).rejects.toMatchObject({ status: 403 });
  });
});
