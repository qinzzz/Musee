import { API_BASE_URL } from '../constants/api';
import { HistoryItem } from './historyCache';

interface SaveHistoryParams {
  photoUri: string;
  artistName: string;
  artworkName: string;
  isRecognized?: boolean;
}

interface GetHistoryParams {
  recognizedOnly?: boolean;
  limit?: number;
  offset?: number;
}

interface HistoryResponse {
  items: HistoryItem[];
  count: number;
  offset: number;
  limit: number;
}

class HistoryApiService {
  /**
   * Save artwork to history on backend
   */
  async saveToHistory(params: SaveHistoryParams): Promise<HistoryItem> {
    const formData = new FormData();
    formData.append('photo_uri', params.photoUri);
    formData.append('artist_name', params.artistName);
    formData.append('artwork_name', params.artworkName);
    formData.append('is_recognized', params.isRecognized !== false ? 'true' : 'false');

    const response = await fetch(`${API_BASE_URL}/api/history`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error('Failed to save to history');
    }

    return await response.json();
  }

  /**
   * Get history from backend
   */
  async getHistory(params: GetHistoryParams = {}): Promise<HistoryResponse> {
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

    const url = `${API_BASE_URL}/api/history?${queryParams.toString()}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error('Failed to fetch history');
    }

    return await response.json();
  }

  /**
   * Delete history entry
   */
  async deleteHistoryEntry(historyId: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/history/${historyId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error('Failed to delete history entry');
    }
  }
}

export const historyApiService = new HistoryApiService();
