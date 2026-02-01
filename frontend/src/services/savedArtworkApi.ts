import { Platform } from 'react-native';
import { apiClient } from './apiClient';
import { userApiService } from './userApi';
import { compressImageToSize } from '../utils/imageUtils';
import { Tag } from './tagApi';

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ColorPalette {
  background: string;
  primary: string;
  secondary: string;
  detail: string;
}

export interface SavedArtwork {
  id: string;
  photo_uri: string;
  artist_name: string;
  artwork_name: string;
  device_id?: string;
  location?: string;
  photo_time?: string;
  museum_name?: string;
  summary: string;
  tags?: string;
  analysis?: string;
  background_color?: string;
  color_palette?: ColorPalette;
  conversation_history: ConversationMessage[];
  is_recognized: number;
  created_at: string;
  updated_at: string;
  artwork_tags?: Tag[];
}

interface SaveArtworkParams {
  photoUri: string;
  artistName: string;
  artworkName: string;
  location?: string;
  museumName?: string;
  conversationHistory: ConversationMessage[];
  photoTime?: string;
  createdTime?: string;
  isRecognized?: boolean;
  tags?: string;
  analysis?: string;
  colorPalette?: ColorPalette;
  sessionId?: string;
}

interface GetSavedArtworksParams {
  recognizedOnly?: boolean;
  limit?: number;
  offset?: number;
}

interface SavedArtworksResponse {
  items: SavedArtwork[];
  count: number;
  offset: number;
  limit: number;
}

class SavedArtworkApiService {
  /**
   * Save artwork with complete conversation history
   */
  async saveArtwork(params: SaveArtworkParams): Promise<SavedArtwork> {
    const userId = await userApiService.getUserId();

    const formData = new FormData();
    formData.append('photo_uri', params.photoUri);
    formData.append('artist_name', params.artistName);
    formData.append('artwork_name', params.artworkName);
    formData.append('conversation_history', JSON.stringify(params.conversationHistory));
    formData.append('user_id', userId);
    formData.append('color_palette', JSON.stringify(params.colorPalette));
    if (params.sessionId) formData.append('session_id', params.sessionId);

    if (params.location) formData.append('location', params.location);
    if (params.museumName) formData.append('museum_name', params.museumName);
    if (params.tags) formData.append('tags', params.tags);
    if (params.analysis) formData.append('analysis', params.analysis);
    if (params.photoTime) formData.append('photo_time', params.photoTime);
    if (params.createdTime) formData.append('created_at', params.createdTime);

    formData.append('is_recognized', params.isRecognized !== false ? 'true' : 'false');

    return apiClient.post<SavedArtwork>('/api/saved-artworks', formData);
  }

  /**
   * Get all saved artworks for this user
   */
  async getSavedArtworks(params: GetSavedArtworksParams = {}): Promise<SavedArtworksResponse> {
    const userId = await userApiService.getUserId();

    const queryParams: Record<string, string> = { user_id: userId };
    if (params.recognizedOnly !== undefined) queryParams.recognized_only = params.recognizedOnly.toString();
    if (params.limit !== undefined) queryParams.limit = params.limit.toString();
    if (params.offset !== undefined) queryParams.offset = params.offset.toString();

    return apiClient.get<SavedArtworksResponse>('/api/saved-artworks', queryParams);
  }

  /**
   * Get a specific saved artwork with full conversation history
   */
  async getSavedArtwork(artworkId: string): Promise<SavedArtwork> {
    return apiClient.get<SavedArtwork>(`/api/saved-artworks/${artworkId}`);
  }

  /**
   * Update a saved artwork's artist name and artwork name
   */
  async updateSavedArtwork(
    artworkId: string,
    artistName: string,
    artworkName: string,
    summary?: string,
    colorPalette?: ColorPalette,
    analysis?: string,
    tags?: string
  ): Promise<SavedArtwork> {
    return apiClient.put<SavedArtwork>(`/api/saved-artworks/${artworkId}`, {
      artist_name: artistName,
      artwork_name: artworkName,
      ...(summary !== undefined && { summary }),
      ...(colorPalette !== undefined && { color_palette: colorPalette }),
      ...(analysis !== undefined && { analysis }),
      ...(tags !== undefined && { tags }),
    });
  }

  /**
   * Delete a saved artwork
   */
  async deleteSavedArtwork(artworkId: string): Promise<void> {
    return apiClient.delete(`/api/saved-artworks/${artworkId}`);
  }

  /**
   * Delete multiple saved artworks in a batch
   */
  async deleteSavedArtworksBatch(artwork_ids: string[]): Promise<{ message: string; deleted_count: number }> {
    return apiClient.post('/api/saved-artworks/batch-delete', artwork_ids);
  }

  async generateArtworkSummary(artworkId: string, imageUri: string, language?: string): Promise<{ summary: string; saved_artwork_id: string; model_used: string }> {
    const formData = new FormData();
    formData.append('saved_artwork_id', artworkId);

    // Compress image to ensure it's under the 4.5MB Vercel limit
    // Targeting 4MB for safety
    console.log('[savedArtworkApiService] Compressing image for summary generation:', imageUri);
    const compressedImage = await compressImageToSize(imageUri, 4 * 1024 * 1024);

    if (Platform.OS === 'web') {
      const response = await fetch(compressedImage.uri);
      const blob = await response.blob();
      formData.append('image', blob, 'artwork.jpg');
    } else {
      formData.append('image', {
        uri: compressedImage.uri,
        type: 'image/jpeg',
        name: 'artwork.jpg',
      } as any);
    }

    if (language) formData.append('language', language);

    return apiClient.post('/api/artwork-summary', formData);
  }

  /**
   * Update the background color for an artwork
   */
  async updateBackgroundColor(artworkId: string, backgroundColor: string): Promise<SavedArtwork> {
    return apiClient.put<SavedArtwork>(`/api/saved-artworks/${artworkId}`, {
      background_color: backgroundColor,
    });
  }

  /**
   * Identify the artist and artwork from an image
   * Handles compression and API call
   */
  async identifyArtist(photoUri: string, identity: string = 'museum_narrator', language: string = 'en', sessionId?: string): Promise<any> {
    console.log('[SavedArtworkApiService] Identifying artist for:', photoUri);

    // 1. Compress image (max 4MB for Vercel/API limits)
    const compressed = await compressImageToSize(photoUri, 4 * 1024 * 1024);
    const uploadUri = compressed.uri;

    // 2. Prepare Form Data
    const formData = new FormData();
    if (Platform.OS === 'web') {
      const resp = await fetch(uploadUri);
      const blob = await resp.blob();
      const jpegBlob = new Blob([blob], { type: 'image/jpeg' });
      formData.append('image', jpegBlob, 'artwork.jpg');
    } else {
      formData.append('image', {
        uri: uploadUri,
        type: 'image/jpeg',
        name: 'artwork.jpg',
      } as any);
    }
    formData.append('identity', identity);
    formData.append('language', language);
    if (sessionId) formData.append('session_id', sessionId);

    // 3. Call API
    // Note: We use the fetch API directly for multipart form data with identity/language
    // to match the previous implementation in useArtworkAnalysis
    const { API_BASE_URL, API_ENDPOINTS } = require('../constants/api');
    const analyze_url = `${API_BASE_URL}${API_ENDPOINTS.ANALYZE_ARTIST}`;

    const response = await fetch(analyze_url, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }

    return response.json();
  }
}

export const savedArtworkApiService = new SavedArtworkApiService();
