
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

export interface ArtworkAnalysisResult {
  artist_name: string;
  artwork_name: string;
  description: string;
  tags: string[];
  model_used: string;
  artwork_id?: string;  // Returned if user_id was provided
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
  photoUri?: string
): Promise<ArtworkAnalysisResult> {
  const formData = new FormData();
  formData.append('image', imageFile);

  if (userId) {
    formData.append('user_id', userId);
  }
  if (photoUri) {
    formData.append('photo_uri', photoUri);
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

  // Parse the analysis - it may be a JSON string wrapped in markdown code blocks
  let analysis: any = data.analysis;

  if (typeof analysis === 'string') {
    // Remove markdown code blocks if present
    let jsonStr = analysis;
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }

    try {
      const parsed = JSON.parse(jsonStr);
      console.log('Parsed analysis:', parsed);

      // Handle array format from backend (first item has artist info, second has analysis/tags)
      if (Array.isArray(parsed)) {
        const artistInfo = parsed[0] || {};
        const analysisInfo = parsed[1] || {};

        // Parse tags from comma-separated string
        let tags: string[] = [];
        if (analysisInfo.tags) {
          tags = analysisInfo.tags.split(',').map((t: string) => `#${t.trim().toLowerCase().replace(/\s+/g, '-')}`);
        }

        return {
          artist_name: data.artist_name || artistInfo.artist_name || 'Unknown Artist',
          artwork_name: data.artwork_name || artistInfo.artwork_name || 'Untitled',
          description: analysisInfo.analysis || '',
          tags: tags,
          model_used: data.model_used || 'unknown',
          artwork_id: data.artwork_id,
        };
      }

      analysis = parsed;
    } catch (e) {
      console.error('Failed to parse analysis JSON:', e);
    }
  }

  // Fallback: handle as object directly
  let tags: string[] = [];
  if (analysis.tags) {
    if (typeof analysis.tags === 'string') {
      tags = analysis.tags.split(/[,\s]+/).filter((t: string) => t).map((t: string) =>
        t.startsWith('#') ? t.toLowerCase() : `#${t.toLowerCase().replace(/\s+/g, '-')}`
      );
    } else if (Array.isArray(analysis.tags)) {
      tags = analysis.tags;
    }
  }

  return {
    artist_name: data.artist_name || analysis.artist_name || 'Unknown Artist',
    artwork_name: data.artwork_name || analysis.artwork_name || 'Untitled',
    description: analysis.description || analysis.analysis || '',
    tags: tags,
    model_used: data.model_used || 'unknown',
    artwork_id: data.artwork_id,
  };
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
    formData.append('image', imageFile);
  }

  console.log('Sending chat request:', { query, artworkId, artistName, artworkName });

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
 * Convert a base64 data URL to a File object
 */
export function base64ToFile(base64: string, filename: string = 'image.jpg'): File {
  const arr = base64.split(',');
  const mimeMatch = arr[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, { type: mime });
}

export interface TagExplanationResponse {
  tag: string;
  explanation: string;
  from_cache: boolean;
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
): Promise<TagExplanationResponse> {
  const params = new URLSearchParams({ tag });
  if (artworkId) {
    params.append('artwork_id', artworkId);
  }

  const response = await fetch(`${API_BASE_URL}/tag-explanation?${params.toString()}`);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error (${response.status}): ${errorText}`);
  }

  return response.json();
}
