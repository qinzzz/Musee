import { createMuseumService } from '@musee/client-core';
import { API_BASE_URL, fetchWithTimeout } from './core';
export type { MuseumSummary, UserMuseumSummary, UserMuseumsResponse } from '@musee/client-core';

export const fetchUserMuseums = createMuseumService({ fetchWithTimeout }, API_BASE_URL).list;
