import { Message } from './types';

/**
 * Suggested topic API endpoint
 */
export async function suggestTopics(
  artistName: string,
  artworkName: string,
  conversationHistory: Message[]
): Promise<string[]> {
  const formData = new FormData();
  formData.append('artist_name', artistName);
  formData.append('artwork_name', artworkName);

  const historyForBackend = conversationHistory.map(msg => ({
    role: msg.role === 'model' ? 'assistant' : msg.role,
    content: msg.text
  }));
  formData.append('conversation_history', JSON.stringify(historyForBackend));

  console.log('Fetching suggested topics for:', { artistName, artworkName });

  const response = await fetch(`${API_BASE_URL}/suggest-topic`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.warn(`Failed to fetch suggested topics: ${errorText}`);
    return [];
  }

  const data: TopicSuggestionResponse = await response.json();
  return data.suggested_topics || [];
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

/**
 * Get the base URL for images (removes /api suffix if present)
 */
export function getBaseDomain(): string {
  return API_BASE_URL.replace(/\/api$/, '');
}

/**
 * Resolve an image URI to a full URL
 * Prepends base domain only if the URI is a relative path
 */
export function resolveImageUrl(photoUri: string | undefined): string {
  if (!photoUri) return '';
  if (photoUri.startsWith('http') || photoUri.startsWith('data:') || photoUri.startsWith('blob:')) {
    return photoUri;
  }

  const baseDomain = getBaseDomain();
  const cleanBase = baseDomain.endsWith('/') ? baseDomain.slice(0, -1) : baseDomain;
  const cleanPath = photoUri.startsWith('/') ? photoUri.slice(1) : photoUri;
  return `${cleanBase}/${cleanPath}`;
}


export interface ArtworkAnalysisResult {
  artist_name: string;
  artwork_name: string;
  description: string;
  tags: string[];
  date?: string;
  medium?: string;
  model_used: string;
  artwork_id?: string;  // Returned if user_id was provided
  photo_uri?: string;   // Server path to stored image (web clients)
}

/**
 * Get or create a persistent user ID for the current browser/device
 */
export function getOrCreateUserId(): string {
  const STORAGE_KEY = 'musee_user_id';
  let userId = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;

  if (!userId) {
    // Generate a new ID: use timestamp + random string for uniqueness
    // Format: web-[timestamp]-[random]
    userId = `web-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, userId);
      console.log('Generated new persistent user ID:', userId);
    }
  }

  return userId;
}

/**
 * Analyze an artwork image using the backend API
 * @param imageFile - The image file to analyze
 * @param userId - Optional user ID to save artwork to DB
 * @param photoUri - Optional photo URI (required if userId provided)
 * @returns Analysis result containing artist, title, description, tags, and artwork_id
 */
export async function analyzeArtwork(
  imageFile: File,
  userId?: string,
  photoUri?: string,
  sessionId?: string
): Promise<ArtworkAnalysisResult> {
  const formData = new FormData();
  formData.append('image', imageFile);
  formData.append('client_type', 'web');  // Tell backend to store image on server

  if (userId) {
    formData.append('user_id', userId);
  }
  if (photoUri) {
    formData.append('photo_uri', photoUri);
  }
  if (sessionId) {
    formData.append('session_id', sessionId);
  }

  console.log('Sending request to:', `${API_BASE_URL}/artwork-analyze`);

  const response = await fetch(`${API_BASE_URL}/artwork-analyze`, {
    method: 'POST',
    body: formData,
  });

  console.log('Response status:', response.status);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  console.log('Raw API response:', data);

  // The backend now provides cleaned, structured data at the top level.
  // We only pull from 'analysis' if the structured fields are missing (legacy support).

  let tags: string[] = [];
  if (Array.isArray(data.tags)) {
    tags = data.tags;
  } else if (typeof data.tags === 'string') {
    tags = data.tags.split(/[,\s]+/).filter((t: string) => t).map((t: string) =>
      t.startsWith('#') ? t.toLowerCase() : `#${t.toLowerCase().replace(/\s+/g, '-')}`
    );
  }

  return {
    artist_name: data.artist_name || 'Unknown Artist',
    artwork_name: data.artwork_name || 'Untitled',
    description: data.analysis || '',
    tags: tags,
    date: data.date,
    medium: data.medium,
    model_used: data.model_used || 'unknown',
    artwork_id: data.artwork_id,
    photo_uri: data.photo_uri,
  };
}

/**
 * Metrics from streaming analysis
 */
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

/**
 * Streaming artwork analysis using SSE (Server-Sent Events)
 * Provides real-time text updates as the AI generates the analysis
 *
 * @param imageFile - The image file to analyze
 * @param userId - Optional user ID to save artwork to DB
 * @param onChunk - Callback for each text chunk received
 * @param onComplete - Callback when analysis is complete with full result
 * @param onError - Callback for errors
 * @param onMetrics - Optional callback for timing metrics (for Vercel Speed Insights)
 */
export async function analyzeArtworkStream(
  imageFile: File,
  userId: string | undefined,
  onChunk: (text: string) => void,
  onComplete: (result: ArtworkAnalysisResult) => void,
  onError: (error: Error) => void,
  sessionId?: string,
  onMetrics?: (metrics: StreamingMetrics) => void
): Promise<void> {
  const formData = new FormData();
  formData.append('image', imageFile);
  formData.append('client_type', 'web');

  if (userId) {
    formData.append('user_id', userId);
  }
  if (sessionId) {
    formData.append('session_id', sessionId);
  }

  console.log('Starting streaming analysis to:', `${API_BASE_URL}/artwork-analyze-stream`);

  try {
    const response = await fetch(`${API_BASE_URL}/artwork-analyze-stream`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error (${response.status}): ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body is not readable');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE events (separated by \n\n)
      const events = buffer.split('\n\n');
      buffer = events.pop() || ''; // Keep incomplete event in buffer

      for (const event of events) {
        if (!event.trim()) continue;

        const lines = event.split('\n');
        let eventType = '';
        let eventData = '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7);
          } else if (line.startsWith('data: ')) {
            eventData = line.slice(6);
          }
        }

        if (!eventData) continue;

        try {
          const data = JSON.parse(eventData);

          if (eventType === 'chunk' && data.type === 'text') {
            onChunk(data.content);
          } else if (eventType === 'complete' && data.type === 'result') {
            // Parse tags from comma-separated string
            let tags: string[] = [];
            if (Array.isArray(data.tags)) {
              tags = data.tags.map((t: string) =>
                t.startsWith('#') ? t.toLowerCase() : `#${t.toLowerCase().replace(/\s+/g, '-')}`
              );
            } else if (typeof data.tags === 'string') {
              tags = data.tags.split(',').map((t: string) =>
                `#${t.trim().toLowerCase().replace(/\s+/g, '-')}`
              );
            }

            const result: ArtworkAnalysisResult = {
              artist_name: data.artist_name || 'Unknown Artist',
              artwork_name: data.artwork_name || 'Untitled',
              description: data.description || '',
              tags: tags,
              date: data.date,
              medium: data.medium,
              model_used: data.model_used || 'unknown',
              artwork_id: data.artwork_id,
              photo_uri: data.photo_uri,
            };

            onComplete(result);
          } else if (eventType === 'metrics' && data.type === 'metrics') {
            // Handle metrics event
            console.log('Streaming metrics:', data);
            if (onMetrics) {
              onMetrics(data as StreamingMetrics);
            }
          } else if (eventType === 'error') {
            throw new Error(data.message || 'Unknown streaming error');
          }
        } catch (parseError) {
          console.error('Failed to parse SSE event:', parseError, eventData);
        }
      }
    }
  } catch (error) {
    console.error('Streaming analysis failed:', error);
    onError(error instanceof Error ? error : new Error(String(error)));
  }
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export interface ChatResponse {
  response: string;
  query: string;
  model_used: string;
}

export interface TopicSuggestionResponse {
  suggested_topics: string[];
  model_used: string;
}

/**
 * Chat with the AI about an artwork
 * Two modes:
 * 1. artwork_id mode: Pass artwork_id to use DB for conversation history (reliable)
 * 2. stateless mode: Pass conversationHistory array (no DB persistence)
 *
 * @param query - The user's message
 * @param artworkId - If provided, uses DB for conversation history (recommended)
 * @param artistName - Optional artist name for context (used in stateless mode)
 * @param artworkName - Optional artwork name for context (used in stateless mode)
 * @param conversationHistory - Previous messages (used only if artworkId not provided)
 * @param imageFile - Optional image file
 */
export async function chatWithArtwork(
  query: string,
  artworkId?: string,
  artistName?: string,
  artworkName?: string,
  conversationHistory: ChatMessage[] = [],
  imageFile?: File
): Promise<string> {
  const formData = new FormData();
  formData.append('query', query);

  // Mode 1: artwork_id mode (DB-backed, reliable)
  if (artworkId) {
    formData.append('artwork_id', artworkId);
  }

  // Mode 2: stateless mode
  if (artistName) {
    formData.append('artist_name', artistName);
  }
  if (artworkName) {
    formData.append('artwork_name', artworkName);
  }
  if (!artworkId && conversationHistory.length > 0) {
    // Only send conversation_history if not using artwork_id mode
    const historyForBackend = conversationHistory.map(msg => ({
      role: msg.role === 'model' ? 'assistant' : msg.role,
      content: msg.text
    }));
    formData.append('conversation_history', JSON.stringify(historyForBackend));
  }
  if (imageFile) {
    console.log('Image file being sent:', {
      name: imageFile.name,
      size: imageFile.size,
      type: imageFile.type
    });
    if (imageFile.size > 0) {
      formData.append('image', imageFile);
    } else {
      console.warn('Image file is empty, not sending');
    }
  }

  console.log('Sending chat request:', { query, artworkId, artistName, artworkName, hasImage: !!imageFile && imageFile.size > 0 });

  const response = await fetch(`${API_BASE_URL}/artwork-chat`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  console.log('Chat response:', data);

  return data.response || '';
}

/**
 * Streaming chat with the AI about an artwork
 * 
 * @param query - The user's message
 * @param onChunk - Callback for each text chunk received
 * @param onComplete - Callback when analysis is complete
 * @param onError - Callback for errors
 * @param artworkId - If provided, uses DB for conversation history
 * @param artistName - Optional artist name for context
 * @param artworkName - Optional artwork name for context
 * @param conversationHistory - Previous messages
 * @param imageFile - Optional image file
 */
export async function chatWithArtworkStream(
  query: string,
  onChunk: (text: string) => void,
  onComplete: (response: string) => void,
  onError: (error: Error) => void,
  artworkId?: string,
  artistName?: string,
  artworkName?: string,
  conversationHistory: ChatMessage[] = [],
  imageFile?: File
): Promise<void> {
  const formData = new FormData();
  formData.append('query', query);

  if (artworkId) {
    formData.append('artwork_id', artworkId);
  }
  if (artistName) {
    formData.append('artist_name', artistName);
  }
  if (artworkName) {
    formData.append('artwork_name', artworkName);
  }

  if (!artworkId && conversationHistory.length > 0) {
    const historyForBackend = conversationHistory.map(msg => ({
      role: msg.role === 'model' ? 'assistant' : msg.role,
      content: msg.text
    }));
    formData.append('conversation_history', JSON.stringify(historyForBackend));
  }

  if (imageFile && imageFile.size > 0) {
    formData.append('image', imageFile);
  }

  console.log('Starting streaming chat to:', `${API_BASE_URL}/artwork-chat-stream`);

  try {
    const response = await fetch(`${API_BASE_URL}/artwork-chat-stream`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error (${response.status}): ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body is not readable');
    }

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
          if (line.startsWith('event: ')) {
            eventType = line.slice(7);
          } else if (line.startsWith('data: ')) {
            eventData = line.slice(6);
          }
        }

        if (!eventData) continue;

        try {
          const data = JSON.parse(eventData);

          if (eventType === 'chunk' && data.type === 'text') {
            onChunk(data.content);
          } else if (eventType === 'complete' && data.type === 'result') {
            onComplete(data.response || '');
          } else if (eventType === 'error') {
            throw new Error(data.message || 'Unknown streaming error');
          }
        } catch (parseError) {
          console.error('Failed to parse SSE event:', parseError, eventData);
        }
      }
    }
  } catch (error) {
    console.error('Streaming chat failed:', error);
    onError(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Convert a base64 data URL to a File object
 */
export function base64ToFile(base64: string, filename: string = 'image.jpg'): File {
  if (!base64 || !base64.includes(',')) {
    console.error('Invalid base64 data URL format');
    throw new Error('Invalid base64 data URL format');
  }

  const arr = base64.split(',');
  if (arr.length < 2 || !arr[1]) {
    console.error('Base64 data URL missing content');
    throw new Error('Base64 data URL missing content');
  }

  const mimeMatch = arr[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';

  console.log('base64ToFile: MIME type detected:', mime);

  const bstr = atob(arr[1]);
  let n = bstr.length;

  console.log('base64ToFile: Decoded length:', n, 'bytes');

  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, { type: mime });
}


/**
 * Get an LLM-generated explanation for a tag
 * Returns cached explanation from DB if available, otherwise generates and caches
 *
 * @param tag - The tag to explain (e.g., "#impressionism")
 * @param artworkId - Optional artwork ID for context
 * @returns One-sentence explanation of the tag
 */
export async function getTagExplanation(
  tag: string,
  artworkId?: string
): Promise<string> {
  const params = new URLSearchParams({ tag });
  if (artworkId) {
    params.append('artwork_id', artworkId);
  }

  const response = await fetch(`${API_BASE_URL}/tag-explanation?${params.toString()}`);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error (${response.status}): ${errorText}`);
  }

  return response.text();
}

/**
 * Fetch previously saved artworks for a user
 * 
 * @param userId - The persistent user ID
 * @returns List of artworks from the backend
 */
export async function fetchUserArtworks(userId: string): Promise<any> {
  const params = new URLSearchParams({
    user_id: userId,
    limit: '100'
  });

  const response = await fetch(`${API_BASE_URL}/artworks?${params.toString()}`);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

/**
 * Delete a saved artwork
 * 
 * @param artworkId - The ID of the artwork to delete
 * @returns Status message
 */
export async function deleteArtwork(artworkId: string): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/artworks/${artworkId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error (${response.status}): ${errorText}`);
  }

  return response.json();
}
