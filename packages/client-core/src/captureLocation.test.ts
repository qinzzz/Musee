import { describe, expect, it, vi } from 'vitest';
import { captureLocationLabel, updateCaptureLocation } from './captureLocation';
import type { ApiClient } from './apiClient';

describe('capture location', () => {
  it('explicit removal and manual place suppress the old venue', () => {
    expect(captureLocationLabel(null, 'Old museum')).toBe('Old museum');
    expect(captureLocationLabel({ status: 'removed' }, 'Old museum')).toBeNull();
    expect(captureLocationLabel({ status: 'selected', source: 'manual', name: 'A café' }, 'Old museum')).toBe('A café');
    expect(captureLocationLabel({ status: 'selected', source: 'apple_maps', place_id: 'id' })).toBe('Place saved in Apple Maps');
  });
  it('sends an explicit removal and surfaces failed saves', async () => {
    const fetchWithTimeout = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'art' }) });
    const client = { fetchWithTimeout } as unknown as ApiClient;
    expect(await updateCaptureLocation(client, '/api', 'art', { status: 'removed' })).toEqual({ id: 'art' });
    expect(JSON.parse(fetchWithTimeout.mock.calls[0][1].body)).toEqual({ status: 'removed' });
    fetchWithTimeout.mockResolvedValue({ ok: false, status: 403 });
    await expect(updateCaptureLocation(client, '/api', 'art', { status: 'removed' })).rejects.toMatchObject({ status: 403 });
  });
});
