import { ApiHttpError, type ApiClient, type SessionRecord } from '@musee/client-core';

export function createMobileSessionManagement(client: Pick<ApiClient, 'fetchWithTimeout'>, baseUrl: string) {
  async function request(url: string, method: string, body?: unknown) {
    const response = await client.fetchWithTimeout(url, {
      method,
      ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });
    if (!response.ok && !(method === 'DELETE' && response.status === 404)) {
      throw new ApiHttpError('Could not update this session. Please try again.', response.status);
    }
    return response;
  }
  const path = (id: string) => `${baseUrl}/sessions/${encodeURIComponent(id)}`;
  return {
    async save(session: SessionRecord, userId: string, title: string, goal: string): Promise<SessionRecord> {
      // Existing endpoints: retries are safe if the title saved but the goal failed.
      const response = await request(`${path(session.id)}?user_id=${encodeURIComponent(userId)}`, 'PUT', { title: title.trim() });
      const result = await response.json() as { session: SessionRecord };
      await request(`${path(session.id)}/goal`, 'PATCH', { goal: goal.trim() });
      return { ...result.session, metadata: { ...result.session.metadata, user_goal: goal.trim() } };
    },
    async remove(id: string, userId: string): Promise<void> {
      await request(`${path(id)}?user_id=${encodeURIComponent(userId)}`, 'DELETE');
    },
  };
}
