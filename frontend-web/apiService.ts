import { Message, ArtworkSkill } from './types';

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

  const lang = getLanguage();
  if (lang) formData.append('language', lang);

  console.log('Fetching suggested topics for:', { artistName, artworkName });

  const response = await fetchWithTimeout(`${API_BASE_URL}/suggest-topic`, {
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

/** Exhibition chat: curator conversation about a collection of works (backend LLM). */
export async function exhibitionChat(
  items: { id: string; url: string; keywords: string[] }[],
  conversationHistory: Message[],
  newMessage: string
): Promise<string> {
  const history = conversationHistory.map(m => ({
    role: m.role === 'model' ? 'assistant' : m.role,
    content: m.text,
  }));
  const response = await fetchWithTimeout(`${API_BASE_URL}/exhibition-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: items.map(i => ({ id: i.id, url: i.url, keywords: i.keywords })),
      conversation_history: history,
      new_message: newMessage,
    }),
  });
  if (!response.ok) {
    const t = await response.text();
    throw new Error(t || `exhibition-chat failed: ${response.status}`);
  }
  const data = await response.json();
  return data.response ?? '';
}

/** Exhibition chat streaming: same as exhibitionChat but streams response to UI. */
export async function exhibitionChatStream(
  items: { id: string; url: string; keywords: string[] }[],
  conversationHistory: Message[],
  newMessage: string,
  onChunk: (text: string) => void,
  onComplete: (response: string) => void,
  onError: (error: Error) => void
): Promise<void> {
  const history = conversationHistory.map(m => ({
    role: m.role === 'model' ? 'assistant' : m.role,
    content: m.text,
  }));
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/exhibition-chat-stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: items.map(i => ({ id: i.id, url: i.url, keywords: i.keywords })),
        conversation_history: history,
        new_message: newMessage,
      }),
      timeout: API_TIMEOUT,
    });
    if (!response.ok) {
      const t = await response.text();
      throw new Error(t || `exhibition-chat-stream failed: ${response.status}`);
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
          if (line.startsWith('event: ')) eventType = line.slice(7);
          else if (line.startsWith('data: ')) eventData = line.slice(6);
        }
        if (!eventData) continue;
        try {
          const data = JSON.parse(eventData);
          if (eventType === 'chunk' && data.type === 'text') {
            onChunk(data.content);
          } else if (eventType === 'complete' && data.type === 'result') {
            onComplete(data.response || '');
          } else if (eventType === 'error') {
            onError(new Error(data.message || 'Stream error'));
          }
        } catch (parseError) {
          if (eventType === 'error') {
            onError(new Error(eventData));
          }
        }
      }
    }
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)));
  }
}

/** Define an aesthetic term (backend LLM). */
export async function defineAestheticTerm(tag: string): Promise<{ definition: string; externalResonances: string[] }> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/define-aesthetic-term`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tag }),
  });
  if (!response.ok) {
    const t = await response.text();
    throw new Error(t || `define-aesthetic-term failed: ${response.status}`);
  }
  const data = await response.json();
  return {
    definition: data.definition ?? '',
    externalResonances: data.externalResonances ?? [],
  };
}

/** Generate TTS audio for text (backend Gemini TTS). Returns true if played. */
export async function generateSpeech(text: string): Promise<boolean> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/generate-speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
    timeout: 30000,
  });
  if (!response.ok) return false;
  const arrayBuffer = await response.arrayBuffer();
  const audioData = new Uint8Array(arrayBuffer);
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  const audioBuffer = await decodePcmToAudioBuffer(audioData, audioContext, 24000, 1);
  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(audioContext.destination);
  source.start();
  return true;
}

function decodePcmToAudioBuffer(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return Promise.resolve(buffer);
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
const API_TIMEOUT = 120000; // 120 seconds
const AUTH_TOKEN_KEY = 'musee_auth_token';
const USER_INFO_KEY = 'musee_user_info';

/** Read the user's language preference from localStorage */
function getLanguage(): string | null {
  return localStorage.getItem('musee_language');
}

/**
 * Enhanced fetch with timeout support and Auth header
 */
async function fetchWithTimeout(resource: RequestInfo | URL, options: RequestInit & { timeout?: number } = {}) {
  const { timeout = API_TIMEOUT } = options;

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  try {
    const response = await fetch(resource, {
      ...options,
      headers,
      signal: controller.signal
    });
    return response;
  } finally {
    clearTimeout(id);
  }
}

/**
 * Login with Google ID Token and migrate anonymous data
 */
export async function loginWithGoogle(idToken: string, anonymousUserId?: string): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/auth/google`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id_token: idToken,
      anonymous_user_id: anonymousUserId,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Login failed: ${errorText}`);
  }

  const data = await response.json();

  // Store authentication details
  if (data.access_token) {
    localStorage.setItem(AUTH_TOKEN_KEY, data.access_token);
  }
  if (data.user) {
    localStorage.setItem(USER_INFO_KEY, JSON.stringify(data.user));
    // Also update the persistent user_id to match the new authenticated user_id
    localStorage.setItem('musee_user_id', data.user.user_id);
  }

  return data;
}

/**
 * Logout and clear local auth data
 */
export function logout() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(USER_INFO_KEY);
  // Note: we might want to keep musee_user_id to generate a new anonymous one next time
  localStorage.removeItem('musee_user_id');
}

/**
 * Get the currently logged in user info from local storage
 */
export function getCurrentUser(): any | null {
  const userInfo = localStorage.getItem(USER_INFO_KEY);
  return userInfo ? JSON.parse(userInfo) : null;
}

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
  location?: string;
  photo_time?: string;
  session_title?: string;
}

export interface TopicSuggestionResponse {
  suggested_topics: string[];
  model_used: string;
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
  imageSource: File,
  userId?: string,
  photoUri?: string,
  sessionId?: string,
  location?: string,
  photoTime?: string,
  latitude?: number,
  longitude?: number
): Promise<ArtworkAnalysisResult> {
  const formData = new FormData();
  formData.append('image', imageSource);
  
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
  if (latitude !== undefined) {
    formData.append('latitude', latitude.toString());
  }
  if (longitude !== undefined) {
    formData.append('longitude', longitude.toString());
  }

  const lang = getLanguage();
  if (lang) formData.append('language', lang);

  console.log('Sending request to:', `${API_BASE_URL}/artwork-analyze`);

  const response = await fetchWithTimeout(`${API_BASE_URL}/artwork-analyze`, {
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
    location: data.location,
    photo_time: data.photo_time,
    session_title: data.session_title,
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

  formData.append('client_type', 'web');  // Tell backend to store image on server

  if (userId) {
    formData.append('user_id', userId);
  }
  if (sessionId) {
    formData.append('session_id', sessionId);
  }
  if (location) {
    formData.append('location', location);
  }
  if (photoTime) {
    formData.append('photo_time', photoTime);
  }
  if (latitude !== undefined) {
    formData.append('latitude', latitude.toString());
  }
  if (longitude !== undefined) {
    formData.append('longitude', longitude.toString());
  }
  if (reasoningEffort) {
    formData.append('reasoning_effort', reasoningEffort);
  }

  const lang = getLanguage();
  if (lang) formData.append('language', lang);

  console.log('Starting streaming analysis to:', `${API_BASE_URL}/artwork-analyze-stream`);

  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/artwork-analyze-stream`, {
      method: 'POST',
      body: formData,
      // For streaming, we might want a longer timeout or none, 
      // but the user requested 120s for ALL api calls.
      timeout: API_TIMEOUT
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
              description: data.analysis || '',
              tags: Array.isArray(data.tags) ? data.tags : [],
              date: data.date,
              medium: data.medium,
              model_used: data.model_used || 'unknown',
              artwork_id: data.artwork_id,
              photo_uri: data.photo_uri,
              location: data.location,
              photo_time: data.photo_time,
              session_title: data.session_title,
            };

            onComplete(result);
          } else if (eventType === 'metrics' && data.type === 'metrics') {
            // Handle metrics event
            console.log('Streaming metrics:', data);
            if (onMetrics) {
              onMetrics(data as StreamingMetrics);
            }
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
  imageFile?: File,
  sessionId?: string
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

  if (sessionId) {
    formData.append('session_id', sessionId);
  }

  const lang = getLanguage();
  if (lang) formData.append('language', lang);

  console.log('Sending chat request:', { query, artworkId, artistName, artworkName, hasImage: !!imageFile && imageFile.size > 0 });

  const response = await fetchWithTimeout(`${API_BASE_URL}/artwork-chat`, {
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
  imageFile?: File,
  sessionId?: string
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

  if (sessionId) {
    formData.append('session_id', sessionId);
  }

  const lang = getLanguage();
  if (lang) formData.append('language', lang);

  console.log('Starting streaming chat to:', `${API_BASE_URL}/artwork-chat-stream`);

  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/artwork-chat-stream`, {
      method: 'POST',
      body: formData,
      timeout: API_TIMEOUT
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
  const lang = getLanguage();
  if (lang) params.append('language', lang);

  const response = await fetchWithTimeout(`${API_BASE_URL}/tag-explanation?${params.toString()}`);

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

  const response = await fetchWithTimeout(`${API_BASE_URL}/artworks?${params.toString()}`);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

export async function getTasteProfile(userId: string): Promise<any> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/taste-profile?user_id=${encodeURIComponent(userId)}`, {});
  if (!response.ok) throw new Error('Failed to load taste profile');
  return response.json();
}

/**
 * Re-run AI identification on a saved artwork using its stored image.
 */
export async function reanalyzeArtwork(artworkId: string): Promise<any> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/artworks/${artworkId}/reanalyze`, {
    method: 'POST',
    timeout: 120000,
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || 'Reanalysis failed');
  }
  return response.json();
}

/**
 * Update artwork metadata (artist, title, date, medium, tags)
 */
export async function updateArtwork(
  artworkId: string,
  updates: { artistName?: string; artworkName?: string; date?: string; medium?: string; tags?: string }
): Promise<any> {
  const body: Record<string, string> = {};
  if (updates.artistName !== undefined) body.artist_name = updates.artistName;
  if (updates.artworkName !== undefined) body.artwork_name = updates.artworkName;
  if (updates.date !== undefined) body.date = updates.date;
  if (updates.medium !== undefined) body.medium = updates.medium;
  if (updates.tags !== undefined) body.tags = updates.tags;

  const response = await fetchWithTimeout(`${API_BASE_URL}/artworks/${artworkId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

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
  const response = await fetchWithTimeout(`${API_BASE_URL}/artworks/${artworkId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

// ── Interactive Explore mode ──────────────────────────────────────────────────

// Module-level Promise caches — keyed by photoUri (skills) or "name||uri" (observations).
// Caching the Promise (not just the result) means concurrent callers share the same in-flight request.
const _skillsCache = new Map<string, Promise<Omit<ArtworkSkill, 'id' | 'observations' | 'more'>[]>>();
const _observationCache = new Map<string, Promise<string>>();

/** Compress a data: or blob: URL to a JPEG File under maxKB using canvas. */
function compressImageToFile(photoUri: string, maxDimension = 1024, maxKB = 900): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      if (Math.max(width, height) > maxDimension) {
        if (width >= height) { height = Math.round(height * maxDimension / width); width = maxDimension; }
        else { width = Math.round(width * maxDimension / height); height = maxDimension; }
      }
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
      const tryQuality = (q: number) => {
        canvas.toBlob(blob => {
          if (!blob) { reject(new Error('compression failed')); return; }
          if (blob.size <= maxKB * 1024 || q <= 0.25) resolve(new File([blob], 'artwork.jpg', { type: 'image/jpeg' }));
          else tryQuality(Math.max(q - 0.2, 0.25));
        }, 'image/jpeg', q);
      };
      tryQuality(0.8);
    };
    img.onerror = reject;
    img.src = photoUri;
  });
}

/**
 * Append an image to a FormData object safely.
 * data:/blob: URLs are compressed client-side before upload to stay under
 * Starlette's 1 MB multipart part limit; server URLs are passed as photo_uri.
 */
async function appendImageToFormData(formData: FormData, photoUri: string): Promise<void> {
  if (photoUri.startsWith('data:') || photoUri.startsWith('blob:')) {
    formData.append('image', await compressImageToFile(photoUri));
  } else {
    formData.append('photo_uri', photoUri);
  }
}

/** Select 3 observation skill angles for an artwork image. */
export function selectArtworkSkills(
  photoUri: string,
  artistName?: string,
  artworkName?: string,
): Promise<Omit<ArtworkSkill, 'id' | 'observations' | 'more'>[]> {
  const cacheKey = `${photoUri}||${artistName ?? ''}||${artworkName ?? ''}`;
  if (_skillsCache.has(cacheKey)) return _skillsCache.get(cacheKey)!;

  const promise = (async () => {
    const formData = new FormData();
    await appendImageToFormData(formData, photoUri);
    const lang = getLanguage();
    if (lang) formData.append('language', lang);
    if (artistName) formData.append('artist_name', artistName);
    if (artworkName) formData.append('artwork_name', artworkName);

    const response = await fetchWithTimeout(`${API_BASE_URL}/artwork-explore-skills`, {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`artwork-explore-skills error (${response.status}): ${errorText}`);
    }
    const data = await response.json();
    return data.skills ?? [];
  })();

  // Remove from cache on failure so a retry is possible
  promise.catch(() => _skillsCache.delete(cacheKey));
  _skillsCache.set(cacheKey, promise);
  return promise;
}

/** Get a single observation for a skill.
 *  First observations (prevObservations=[]) are cached per skill+image so prefetching works transparently.
 */
export function fetchSkillObservation(
  skillName: string,
  skillDesc: string,
  prevObservations: string[],
  photoUri: string,
  artworkId?: string,
): Promise<string> {
  // Only cache the first observation (no prior context)
  const cacheKey = prevObservations.length === 0 ? `${skillName}||${photoUri}` : null;
  if (cacheKey && _observationCache.has(cacheKey)) return _observationCache.get(cacheKey)!;

  const promise = (async () => {
    const formData = new FormData();
    formData.append('skill_name', skillName);
    formData.append('skill_desc', skillDesc);
    await appendImageToFormData(formData, photoUri);
    if (prevObservations.length > 0) {
      formData.append('prev_observations', JSON.stringify(prevObservations));
    }
    const lang = getLanguage();
    if (lang) formData.append('language', lang);
    const userId = getOrCreateUserId();
    if (userId) formData.append('user_id', userId);
    if (artworkId) formData.append('artwork_id', artworkId);

    const response = await fetchWithTimeout(`${API_BASE_URL}/artwork-skill-observation`, {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`artwork-skill-observation error (${response.status}): ${errorText}`);
    }
    const data = await response.json();
    return data.observation ?? '';
  })();

  if (cacheKey) {
    promise.catch(() => _observationCache.delete(cacheKey));
    _observationCache.set(cacheKey, promise);
  }
  return promise;
}

/**
 * Prefetch explore data: selects skills (with optional artist context) then fetches first
 * observation for all skills in parallel. Cached so the component resolves instantly.
 */
export async function prefetchExploreDataWithContext(
  photoUri: string,
  artistName?: string,
  artworkName?: string,
): Promise<void> {
  try {
    const skills = await selectArtworkSkills(photoUri, artistName, artworkName);
    await Promise.all(skills.map(s => fetchSkillObservation(s.name, s.desc, [], photoUri)));
  } catch {
    // Silent — component will retry on demand
  }
}

const _deepDiveCache = new Map<string, Promise<{ text: string; question: string }>>();

/** Get a deep-dive reading and open question for a skill. */
export function fetchSkillDeepDive(
  skillName: string,
  skillDesc: string,
  photoUri: string,
  artworkId?: string,
): Promise<{ text: string; question: string }> {
  const cacheKey = `${skillName}||${photoUri}`;
  if (_deepDiveCache.has(cacheKey)) return _deepDiveCache.get(cacheKey)!;

  const promise = (async () => {
    const formData = new FormData();
    formData.append('skill_name', skillName);
    formData.append('skill_desc', skillDesc);
    await appendImageToFormData(formData, photoUri);
    const lang = getLanguage();
    if (lang) formData.append('language', lang);
    const userId = getOrCreateUserId();
    if (userId) formData.append('user_id', userId);
    if (artworkId) formData.append('artwork_id', artworkId);

    const response = await fetchWithTimeout(`${API_BASE_URL}/artwork-skill-deepdive`, {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`artwork-skill-deepdive error (${response.status}): ${errorText}`);
    }
    return response.json();
  })();

  promise.catch(() => _deepDiveCache.delete(cacheKey));
  _deepDiveCache.set(cacheKey, promise);
  return promise;
}

export interface SmartCollection {
  id: string;
  type: 'movement';
  name: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'legendary';
  description: string;
  artwork_count: number;
  artwork_ids: string[];
  cover_uris: string[];
  hook: string;
}

export async function fetchSmartCollections(userId: string): Promise<SmartCollection[]> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/smart-collections?user_id=${encodeURIComponent(userId)}`);
  if (!response.ok) {
    throw new Error(`smart-collections error (${response.status})`);
  }
  const data = await response.json();
  return data.collections as SmartCollection[];
}

/**
 * Delete an entire session and its artworks
 *
 * @param sessionId - The ID of the session to delete
 * @returns Status message
 */
export async function deleteSession(sessionId: string): Promise<any> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/sessions/${sessionId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error (${response.status}): ${errorText}`);
  }

  return response.json();
}
