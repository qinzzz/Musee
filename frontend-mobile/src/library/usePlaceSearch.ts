import { useEffect, useState } from 'react';
import { applePlaces, type ApplePlace } from '../platform/places/applePlaces';

export const PLACE_SEARCH_DELAY_MS = 450;
const SEARCH_ERROR = 'Could not search Apple Maps. Try again or enter a place manually.';

export function usePlaceSearch(query: string, enabled: boolean,
  location?: { latitude?: number; longitude?: number } | null) {
  const [results, setResults] = useState<ApplePlace[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latitude = location?.latitude;
  const longitude = location?.longitude;
  useEffect(() => {
    let active = true;
    setResults([]); setError(null);
    if (!enabled || query.trim().length < 2) { setSearching(false); return; }
    setSearching(true);
    const timer = setTimeout(() => {
      Promise.resolve().then(() => applePlaces.search(query.trim(), { latitude, longitude }))
        .then((places) => { if (active) setResults(places); })
        .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : SEARCH_ERROR); })
        .finally(() => { if (active) setSearching(false); });
    }, PLACE_SEARCH_DELAY_MS);
    return () => { active = false; clearTimeout(timer); };
  }, [query, enabled, latitude, longitude]);
  return { results, searching, error };
}
