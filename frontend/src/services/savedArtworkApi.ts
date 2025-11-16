import { API_BASE_URL } from '../constants/api';

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface SavedArtwork {
  id: string;
  photo_uri: string;
  artist_name: string;
  artwork_name: string;
  location?: string;
  museum_name?: string;
  summary: string;
  background_color?: string;
  conversation_history: ConversationMessage[];
  is_recognized: number;
  created_at: string;
  updated_at: string;
}

interface SaveArtworkParams {
  photoUri: string;
  artistName: string;
  artworkName: string;
  location?: string;
  museumName?: string;
  conversationHistory: ConversationMessage[];
  isRecognized?: boolean;
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
    const formData = new FormData();
    formData.append('photo_uri', params.photoUri);
    formData.append('artist_name', params.artistName);
    formData.append('artwork_name', params.artworkName);
    formData.append('conversation_history', JSON.stringify(params.conversationHistory));

    if (params.location) {
      formData.append('location', params.location);
    }

    if (params.museumName) {
      formData.append('museum_name', params.museumName);
    }

    formData.append('is_recognized', params.isRecognized !== false ? 'true' : 'false');

    const response = await fetch(`${API_BASE_URL}/api/saved-artworks`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error('Failed to save artwork');
    }

    return await response.json();
  }

  /**
   * Get all saved artworks
   */
  async getSavedArtworks(params: GetSavedArtworksParams = {}): Promise<SavedArtworksResponse> {
    const queryParams = new URLSearchParams();

    if (params.recognizedOnly !== undefined) {
      queryParams.append('recognized_only', params.recognizedOnly.toString());
    }
    if (params.limit !== undefined) {
      queryParams.append('limit', params.limit.toString());
    }
    if (params.offset !== undefined) {
      queryParams.append('offset', params.offset.toString());
    }

    const url = `${API_BASE_URL}/api/saved-artworks?${queryParams.toString()}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error('Failed to fetch saved artworks');
    }

    return await response.json();
  }

  /**
   * Get a specific saved artwork with full conversation history
   */
  async getSavedArtwork(artworkId: string): Promise<SavedArtwork> {
    const response = await fetch(`${API_BASE_URL}/api/saved-artworks/${artworkId}`);

    if (!response.ok) {
      throw new Error('Failed to fetch saved artwork');
    }

    return await response.json();
  }

  /**
   * Update a saved artwork's artist name and artwork name
   */
  async updateSavedArtwork(
    artworkId: string,
    artistName: string,
    artworkName: string,
    summary?: string
  ): Promise<SavedArtwork> {
    const response = await fetch(`${API_BASE_URL}/api/saved-artworks/${artworkId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        artist_name: artistName,
        artwork_name: artworkName,
        ...(summary !== undefined && { summary }),
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to update saved artwork');
    }

    return await response.json();
  }

  /**
   * Delete a saved artwork
   */
  async deleteSavedArtwork(artworkId: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/saved-artworks/${artworkId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error('Failed to delete saved artwork');
    }
  }

  /**
   * Generate a fun, one-sentence summary for an artwork
   */
  async generateArtworkSummary(artworkId: string, imageUri: string): Promise<{ summary: string; saved_artwork_id: string; model_used: string }> {
    const formData = new FormData();
    formData.append('saved_artwork_id', artworkId);

    // Append the image file
    formData.append('image', {
      uri: imageUri,
      type: 'image/jpeg',
      name: 'artwork.jpg',
    } as any);

    const response = await fetch(`${API_BASE_URL}/api/artwork-summary`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error('Failed to generate artwork summary');
    }

    return await response.json();
  }

  /**
   * Update the background color for an artwork
   */
  async updateBackgroundColor(artworkId: string, backgroundColor: string): Promise<SavedArtwork> {
    const response = await fetch(`${API_BASE_URL}/api/saved-artworks/${artworkId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        background_color: backgroundColor,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to update background color');
    }

    return await response.json();
  }
}

export const savedArtworkApiService = new SavedArtworkApiService();
