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
