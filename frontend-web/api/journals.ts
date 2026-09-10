import { createJournalService } from '@musee/client-core';
import { API_BASE_URL, fetchWithTimeout } from './core';

export type { JournalArtworkPreview, JournalListItem } from '@musee/client-core';

export const fetchUserJournals = createJournalService({ fetchWithTimeout }, API_BASE_URL).list;
