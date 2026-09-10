import { throwIfRequestCancelled } from '../api/requestCancellation';
import { queryOptions } from '@tanstack/react-query';
import { MOBILE_API_BASE_URL, mobileSessionService } from '../api/runtime';
import { mapMobileArtwork } from '../library/mobileArtworkLibraryService';

export const sessionKeys = {
  all: (userId: string) => ['sessions', userId] as const,
  list: (userId: string) => ['sessions', userId, 'list'] as const,
  detail: (userId: string, id: string) => ['sessions', userId, 'detail', id] as const,
};
export function sessionListQuery(userId: string) {
  return queryOptions({
    queryKey: sessionKeys.list(userId),
    queryFn: () => mobileSessionService.fetchSessions(userId),
    enabled: !!userId,
  });
}
export function sessionSnapshotQuery(userId: string, id: string) {
  return queryOptions({
    queryKey: sessionKeys.detail(userId, id),
    queryFn: async ({ signal }) => {
      const [session, events, artworks] = await Promise.all([
        mobileSessionService.fetchSession(id),
        mobileSessionService.fetchEvents(id),
        mobileSessionService.fetchArtworks(id, userId),
      ]);
      throwIfRequestCancelled(signal);
      return { session, events, artworks: artworks.map((record) => mapMobileArtwork(record, MOBILE_API_BASE_URL)) };
    },
  });
}
