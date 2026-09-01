import type { SseMessage } from './sse';

export type ArtworkAnalysisStatus = 'pending' | 'analyzing' | 'failed' | 'analyzed';

export type ArtworkAnalysisResult = {
  artist_name: string;
  artwork_name: string;
  analysis: string;
  artwork_id: string;
  analysis_status: ArtworkAnalysisStatus;
  analysis_error?: string | null;
  date?: string | null;
  medium?: string | null;
  movement?: string | null;
  period_bucket?: string | null;
  tags: string[];
  model_used: string;
  reference_urls?: string[];
  artist_entity_id?: string | null;
};

export type ArtworkAnalysisMetrics = {
  request_id: string;
  model: string;
  timings: {
    time_to_first_chunk_ms: number | null;
    streaming_duration_ms: number | null;
    total_duration_ms: number;
  };
};

export type ArtworkAnalysisStreamEvent =
  | { type: 'chunk'; content: string }
  | { type: 'complete'; result: ArtworkAnalysisResult }
  | { type: 'metrics'; metrics: ArtworkAnalysisMetrics }
  | { type: 'error'; message: string };

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null;
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function nullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === 'string' ? value : undefined;
}

function parseComplete(data: JsonObject): ArtworkAnalysisResult | null {
  const artworkId = stringValue(data.artwork_id);
  if (!artworkId) return null;
  return {
    artist_name: stringValue(data.artist_name, 'Unknown Artist'),
    artwork_name: stringValue(data.artwork_name, 'Untitled'),
    analysis: stringValue(data.analysis),
    artwork_id: artworkId,
    analysis_status: 'analyzed',
    analysis_error: nullableString(data.analysis_error),
    date: nullableString(data.date),
    medium: nullableString(data.medium),
    movement: nullableString(data.movement),
    period_bucket: nullableString(data.period_bucket),
    tags: Array.isArray(data.tags)
      ? data.tags.filter((tag): tag is string => typeof tag === 'string')
      : [],
    model_used: stringValue(data.model_used, 'unknown'),
    reference_urls: Array.isArray(data.reference_urls)
      ? data.reference_urls.filter((url): url is string => typeof url === 'string')
      : [],
    artist_entity_id: nullableString(data.artist_entity_id),
  };
}

export function parseArtworkAnalysisStreamEvent(
  message: SseMessage,
): ArtworkAnalysisStreamEvent | null {
  let data: unknown;
  try {
    data = JSON.parse(message.data);
  } catch {
    return null;
  }
  if (!isObject(data)) return null;

  if (message.event === 'chunk' && data.type === 'text') {
    const content = stringValue(data.content);
    return content ? { type: 'chunk', content } : null;
  }
  if (message.event === 'complete' && data.type === 'result') {
    const result = parseComplete(data);
    return result ? { type: 'complete', result } : null;
  }
  if (message.event === 'metrics' && data.type === 'metrics') {
    return { type: 'metrics', metrics: data as ArtworkAnalysisMetrics };
  }
  if (message.event === 'error') {
    return { type: 'error', message: stringValue(data.message, 'Artwork analysis failed.') };
  }
  return null;
}
