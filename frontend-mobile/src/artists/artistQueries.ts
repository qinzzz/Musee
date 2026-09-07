import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

export const artistKeys = {
  all: (userId: string) => ['artists', userId] as const,
  list: (userId: string) => ['artists', userId, 'list'] as const,
  profile: (userId: string, id: string) => ['artists', userId, 'profile', id] as const,
  works: (userId: string, id: string) => ['artists', userId, 'works', id] as const,
  preview: (userId: string, id: string) => ['artists', userId, 'preview', id] as const,
};
export function useArtistRefresh(userId: string) {
  const client = useQueryClient();
  useFocusEffect(useCallback(() => {
    if (userId) void client.invalidateQueries({ queryKey: artistKeys.all(userId) });
  }, [client, userId]));
}
