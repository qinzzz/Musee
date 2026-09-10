import type { ApiClient } from './apiClient';
import { ApiHttpError } from './health';

export interface JournalArtworkPreview {
  id: string;
  photo_uri: string | null;
  artwork_name: string;
  artist_name: string;
  is_deleted?: boolean;
}

export interface JournalListItem {
  id: string;
  local_date: string;
  location: string | null;
  reflection: string;
  representative_artworks: JournalArtworkPreview[];
}

const JOURNAL_TIMEOUT_MS = 15_000;
const LOAD_ERROR = 'Musee could not load journals.';

export function createJournalService(client: Pick<ApiClient, 'fetchWithTimeout'>, baseUrl: string) {
  return {
    async list(userId: string): Promise<JournalListItem[]> {
      const response = await client.fetchWithTimeout(
        `${baseUrl}/journals?user_id=${encodeURIComponent(userId)}`,
        { timeout: JOURNAL_TIMEOUT_MS },
      );
      if (!response.ok) throw new ApiHttpError(LOAD_ERROR, response.status);
      const payload = await response.json();
      // A malformed response must not look like an account with no journals.
      if (!Array.isArray(payload?.items) || !payload.items.every((item: JournalListItem | null) => (
        item && typeof item.id === 'string' && typeof item.local_date === 'string'
        && typeof item.reflection === 'string'
      ))) throw new Error(LOAD_ERROR);
      return payload.items;
    },
  };
}
