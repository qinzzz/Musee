import { describe, expect, it, vi } from 'vitest';

import type { ApiClient } from '@musee/client-core';

import {
  createMobileArtworkAnalysisTransport,
  MobileArtworkAnalysisError,
} from './mobileArtworkAnalysisTransport';

function createClient(response: Response): ApiClient {
  return {
    fetchWithTimeout: vi.fn().mockResolvedValue(response),
    getAccessToken: vi.fn(),
    setAccessToken: vi.fn(),
    refreshAccessToken: vi.fn(),
  };
}

function streamResponse(parts: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(part));
      controller.close();
    },
  }));
}

describe('mobile artwork analysis transport', () => {
  it('reads progress and the terminal result from an authenticated SSE request', async () => {
    const response = streamResponse([
      'event: chunk\ndata: {"type":"text","content":"Looking"}\n',
      '\nevent: metrics\ndata: {"type":"metrics","request_id":"r1","model":"openai","timings":{"time_to_first_chunk_ms":10,"streaming_duration_ms":20,"total_duration_ms":30}}\n\n',
      'event: complete\ndata: {"type":"result","artwork_id":"art-1","artist_name":"Hilma af Klint","artwork_name":"The Swan","analysis":"Symbolic abstraction.","tags":[],"model_used":"openai","analysis_status":"analyzed"}\n\n',
    ]);
    const client = createClient(response);
    const progress = vi.fn();
    const transport = createMobileArtworkAnalysisTransport({
      apiBaseUrl: 'https://api.example.com/api',
      apiClient: client,
    });

    await expect(transport.analyzeArtwork('art-1', progress)).resolves.toMatchObject({
      artwork_id: 'art-1',
      artist_name: 'Hilma af Klint',
      analysis_status: 'analyzed',
    });
    expect(progress).toHaveBeenCalledWith({ type: 'chunk', content: 'Looking' });
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ type: 'metrics' }));
    expect(client.fetchWithTimeout).toHaveBeenCalledWith(
      'https://api.example.com/api/artworks/art-1/analyze-stream',
      expect.objectContaining({ method: 'POST', credentials: 'omit' }),
    );
  });

  it('surfaces an SSE error and requires a terminal complete event', async () => {
    const errorTransport = createMobileArtworkAnalysisTransport({
      apiBaseUrl: '/api',
      apiClient: createClient(streamResponse([
        'event: error\ndata: {"type":"error","message":"provider unavailable"}\n\n',
      ])),
    });
    await expect(errorTransport.analyzeArtwork('art-1')).rejects.toEqual(
      new MobileArtworkAnalysisError('provider unavailable'),
    );

    const incompleteTransport = createMobileArtworkAnalysisTransport({
      apiBaseUrl: '/api',
      apiClient: createClient(streamResponse([
        'event: chunk\ndata: {"type":"text","content":"partial"}\n\n',
      ])),
    });
    await expect(incompleteTransport.analyzeArtwork('art-1')).rejects.toThrow(
      'Analysis ended before a result was received.',
    );
  });
});


describe('label-assisted identification', () => {
  const label = { uri: 'file:///label.jpg', fileName: 'label.jpg', mimeType: 'image/jpeg', width: 100, height: 100, source: 'camera' as const };
  it('sends the temporary label with an existing artwork ID to the web identification endpoint', async () => {
    const result = { artwork_id: 'art-1', artist_name: 'Artist', artwork_name: 'Work', analysis: 'From label', tags: [], analysis_status: 'analyzed' };
    const client = createClient(Response.json(result));
    const transport = createMobileArtworkAnalysisTransport({ apiBaseUrl: '/api', apiClient: client,
      createUploadFile: () => new Blob(['label'], { type: 'image/jpeg' }) });
    await expect(transport.analyzeArtwork('art-1', undefined, label)).resolves.toEqual(result);
    const [url, options] = vi.mocked(client.fetchWithTimeout).mock.calls[0];
    expect(url).toBe('/api/artworks/analyze');
    const body = options?.body as FormData;
    expect(body.get('artwork_id')).toBe('art-1');
    expect((body.get('label_image') as File).name).toBe('label.jpg');
    expect(body.get('image')).toBeNull();
    expect(options?.credentials).toBe('omit');
  });
  it('keeps label analysis errors retryable', async () => {
    const transport = createMobileArtworkAnalysisTransport({ apiBaseUrl: '/api',
      apiClient: createClient(Response.json({ detail: 'Try again' }, { status: 503 })),
      createUploadFile: () => new Blob(['label']) });
    await expect(transport.analyzeArtwork('art-1', undefined, label)).rejects.toEqual(
      new MobileArtworkAnalysisError('Try again', 503));
  });
});
