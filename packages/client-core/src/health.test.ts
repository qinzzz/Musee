import { describe, expect, it, vi } from 'vitest';

import type { ApiClient } from './apiClient';
import {
  ApiHttpError,
  fetchBackendHealth,
  resolveBackendOrigin,
  type BackendHealth,
} from './health';

const HEALTH_RESPONSE: BackendHealth = {
  status: 'healthy',
  ai_provider: 'openai',
  database_enabled: true,
};

function createClient(response: Response): ApiClient {
  return {
    fetchWithTimeout: vi.fn().mockResolvedValue(response),
    getAccessToken: vi.fn().mockReturnValue(null),
    setAccessToken: vi.fn(),
    refreshAccessToken: vi.fn().mockResolvedValue(null),
  };
}

describe('backend health', () => {
  it.each([
    ['https://api.example.com/api', 'https://api.example.com'],
    ['https://api.example.com/api/', 'https://api.example.com'],
    ['https://api.example.com', 'https://api.example.com'],
    ['/api', ''],
  ])('resolves the backend origin from %s', (apiBaseUrl, expected) => {
    expect(resolveBackendOrigin(apiBaseUrl)).toBe(expected);
  });

  it('loads health from the backend root', async () => {
    const client = createClient(Response.json(HEALTH_RESPONSE));

    await expect(fetchBackendHealth(client, 'http://127.0.0.1:8000/api')).resolves.toEqual(
      HEALTH_RESPONSE,
    );
    expect(client.fetchWithTimeout).toHaveBeenCalledWith('http://127.0.0.1:8000/health');
  });

  it('throws a typed HTTP error for an unhealthy response', async () => {
    const client = createClient(new Response(null, { status: 503 }));

    await expect(fetchBackendHealth(client, '/api')).rejects.toEqual(
      new ApiHttpError('Musee backend health check failed.', 503),
    );
  });
});
