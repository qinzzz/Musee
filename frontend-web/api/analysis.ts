import type { ReferenceItem } from '../types';
import { API_BASE_URL, API_TIMEOUT, fetchWithTimeout, getLanguage } from './core';
import { base64ToFile } from './misc';
import { prefetchExploreDataWithContext } from './explore';

export interface ArtworkAnalysisResult {
  artist_name: string;
  artwork_name: string;
  description: string;
  tags: string[];
  date?: string;
  medium?: string;
  model_used: string;
  artwork_id?: string;
  photo_uri?: string;
  location?: string;
  photo_time?: string;
  reference_urls?: ReferenceItem[];
  artist_entity_id?: string;
  analysis_status?: 'pending' | 'analyzing' | 'failed' | 'analyzed';
  analysis_error?: string | null;
}

export interface SavedArtworkUploadResult {
  id: string;
  photo_uri: string;
  artist_name: string;
  artwork_name: string;
  location?: string | Record<string, unknown> | null;
  photo_time?: string | null;
  session_links?: Array<{
    id?: string;
    session_id: string;
    sequence_number?: number;
    source?: 'library' | 'upload' | 'camera';
    created_at?: string;
  }>;
  analysis_status: 'pending' | 'analyzing' | 'failed' | 'analyzed';
  analysis_error?: string | null;
  created_at?: string;
}

export interface StreamingMetrics {
  request_id: string;
  timings: {
    image_processing_ms: number;
    time_to_ai_call_ms: number | null;
    time_to_first_chunk_ms: number | null;
    ai_first_chunk_latency_ms: number | null;
    streaming_duration_ms: number | null;
    total_duration_ms: number;
  };
  model: string;
}

function normalizeTags(data: any): string[] {
  if (Array.isArray(data.tags)) {
    return data.tags;
  }
  if (typeof data.tags === 'string') {
    return data.tags
      .split(/[,\s]+/)
      .filter((tag: string) => tag)
      .map((tag: string) => (tag.startsWith('#') ? tag.toLowerCase() : `#${tag.toLowerCase().replace(/\s+/g, '-')}`));
  }
  return [];
}

async function compressImageToFile(photoUri: string, maxDimension = 1024, maxKB = 900): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      if (Math.max(width, height) > maxDimension) {
        if (width >= height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
      const tryQuality = (quality: number) => {
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error('compression failed'));
            return;
          }
          if (blob.size <= maxKB * 1024 || quality <= 0.25) {
            resolve(new File([blob], 'artwork.jpg', { type: 'image/jpeg' }));
          } else {
            tryQuality(Math.max(quality - 0.2, 0.25));
          }
        }, 'image/jpeg', quality);
      };
      tryQuality(0.8);
    };
    img.onerror = reject;
    img.src = photoUri;
  });
}

async function appendImageToFormData(formData: FormData, photoUri: string): Promise<void> {
  if (photoUri.startsWith('data:') || photoUri.startsWith('blob:')) {
    formData.append('image', await compressImageToFile(photoUri));
  } else {
    formData.append('photo_uri', photoUri);
  }
}

export async function analyzeArtwork(
  imageSource: File,
  userId?: string,
  photoUri?: string,
  sessionId?: string,
  location?: string,
  photoTime?: string,
  latitude?: number,
  longitude?: number,
  context?: {
    artworkId?: string;
    artistName?: string;
    artworkName?: string;
  },
): Promise<ArtworkAnalysisResult> {
  const formData = new FormData();
  formData.append('image', imageSource);
  formData.append('client_type', 'web');

  if (userId) formData.append('user_id', userId);
  if (photoUri) formData.append('photo_uri', photoUri);
  if (sessionId) formData.append('session_id', sessionId);
  if (latitude !== undefined) formData.append('latitude', latitude.toString());
  if (longitude !== undefined) formData.append('longitude', longitude.toString());
  if (context?.artworkId) formData.append('artwork_id', context.artworkId);
  if (context?.artistName) formData.append('artist_name', context.artistName);
  if (context?.artworkName) formData.append('artwork_name', context.artworkName);

  const lang = getLanguage();
  if (lang) formData.append('language', lang);

  const response = await fetchWithTimeout(`${API_BASE_URL}/artworks/analyze`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return {
    artist_name: data.artist_name || 'Unknown Artist',
    artwork_name: data.artwork_name || 'Untitled',
    description: data.analysis || '',
    tags: normalizeTags(data),
    date: data.date,
    medium: data.medium,
    model_used: data.model_used || 'unknown',
    artwork_id: data.artwork_id,
    photo_uri: data.photo_uri,
    location: data.location,
    photo_time: data.photo_time,
    reference_urls: data.reference_urls || [],
    artist_entity_id: data.artist_entity_id,
    analysis_status: data.analysis_status,
    analysis_error: data.analysis_error,
  };
}

export async function saveArtworkUpload(
  imageSource: File,
  userId?: string,
  sessionId?: string,
  location?: string,
  photoTime?: string,
  latitude?: number,
  longitude?: number,
  source: 'upload' | 'camera' = 'upload',
  sequenceNumber?: number,
  requestId?: string,
): Promise<SavedArtworkUploadResult> {
  const formData = new FormData();
  formData.append('image', imageSource);
  formData.append('client_type', 'web');
  formData.append('source', source);

  if (userId) formData.append('user_id', userId);
  if (sessionId) formData.append('session_id', sessionId);
  if (location) formData.append('location', location);
  if (photoTime) formData.append('photo_time', photoTime);
  if (latitude !== undefined) formData.append('latitude', latitude.toString());
  if (longitude !== undefined) formData.append('longitude', longitude.toString());
  if (sequenceNumber !== undefined) formData.append('sequence_number', sequenceNumber.toString());
  if (requestId) formData.append('request_id', requestId);

  const response = await fetchWithTimeout(`${API_BASE_URL}/artworks/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

export async function analyzeArtworkFromExisting(
  artworkId: string,
  context?: {
    artistName?: string;
    artworkName?: string;
    additionalClue?: string;
    labelFile?: File | null;
  },
): Promise<ArtworkAnalysisResult> {
  const formData = new FormData();
  formData.append('artwork_id', artworkId);
  if (context?.artistName) formData.append('artist_name', context.artistName);
  if (context?.artworkName) formData.append('artwork_name', context.artworkName);
  if (context?.additionalClue) formData.append('additional_clue', context.additionalClue);
  if (context?.labelFile) formData.append('label_image', context.labelFile);

  const lang = getLanguage();
  if (lang) formData.append('language', lang);

  const response = await fetchWithTimeout(`${API_BASE_URL}/artworks/analyze`, {
    method: 'POST',
    body: formData,
    timeout: 120000,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return {
    artist_name: data.artist_name || 'Unknown Artist',
    artwork_name: data.artwork_name || 'Untitled',
    description: data.analysis || '',
    tags: normalizeTags(data),
    date: data.date,
    medium: data.medium,
    model_used: data.model_used || 'unknown',
    artwork_id: data.artwork_id,
    photo_uri: data.photo_uri,
    location: data.location,
    photo_time: data.photo_time,
    reference_urls: data.reference_urls || [],
    artist_entity_id: data.artist_entity_id,
    analysis_status: data.analysis_status,
    analysis_error: data.analysis_error,
  };
}

export async function analyzeArtworkStream(
  imageFile: File | null,
  userId: string | undefined,
  onChunk: (text: string) => void,
  onComplete: (result: ArtworkAnalysisResult) => void,
  onError: (error: Error) => void,
  sessionId?: string,
  onMetrics?: (metrics: StreamingMetrics) => void,
  location?: string,
  photoTime?: string,
  latitude?: number,
  longitude?: number,
  reasoningEffort?: string,
  photoUri?: string,
): Promise<void> {
  const formData = new FormData();
  if (imageFile) {
    formData.append('image', imageFile);
  } else if (photoUri) {
    await appendImageToFormData(formData, photoUri);
  }

  formData.append('client_type', 'web');
  if (userId) formData.append('user_id', userId);
  if (sessionId) formData.append('session_id', sessionId);
  if (location) formData.append('location', location);
  if (photoTime) formData.append('photo_time', photoTime);
  if (latitude !== undefined) formData.append('latitude', latitude.toString());
  if (longitude !== undefined) formData.append('longitude', longitude.toString());
  if (reasoningEffort) formData.append('reasoning_effort', reasoningEffort);

  const lang = getLanguage();
  if (lang) formData.append('language', lang);

  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/artwork-analyze-stream`, {
      method: 'POST',
      body: formData,
      timeout: API_TIMEOUT,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error (${response.status}): ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('Response body is not readable');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() || '';

      for (const event of events) {
        if (!event.trim()) continue;

        const lines = event.split('\n');
        let eventType = '';
        let eventData = '';

        for (const line of lines) {
          if (line.startsWith('event: ')) eventType = line.slice(7);
          else if (line.startsWith('data: ')) eventData = line.slice(6);
        }

        if (!eventData) continue;

        try {
          const data = JSON.parse(eventData);

          if (eventType === 'chunk' && data.type === 'text') {
            onChunk(data.content);
          } else if (eventType === 'complete' && data.type === 'result') {
            onComplete({
              artist_name: data.artist_name || 'Unknown Artist',
              artwork_name: data.artwork_name || 'Untitled',
              description: data.analysis || '',
              tags: Array.isArray(data.tags) ? data.tags : [],
              date: data.date,
              medium: data.medium,
              model_used: data.model_used || 'unknown',
              artwork_id: data.artwork_id,
              photo_uri: data.photo_uri,
              location: data.location,
              photo_time: data.photo_time,
              reference_urls: data.reference_urls || [],
              artist_entity_id: data.artist_entity_id,
            });
          } else if (eventType === 'metrics' && data.type === 'metrics') {
            if (onMetrics) onMetrics(data as StreamingMetrics);
          } else if (eventType === 'error') {
            onError(new Error(data.message || 'Unknown streaming error'));
            return;
          }
        } catch (parseError) {
          console.error('Failed to parse SSE event:', parseError, eventData);
        }
      }
    }
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)));
  }
}

export { base64ToFile, prefetchExploreDataWithContext };
