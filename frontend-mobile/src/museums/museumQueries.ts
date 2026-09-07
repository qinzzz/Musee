import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

export const museumKeys = {
  all: (userId: string) => ['museums', userId] as const,
  list: (userId: string) => ['museums', userId, 'list'] as const,
  works: (userId: string, id: string) => ['museums', userId, 'works', id] as const,
};
export function useMuseumRefresh(userId: string) {
  const client = useQueryClient();
  useFocusEffect(useCallback(() => {
    if (userId) void client.invalidateQueries({ queryKey: museumKeys.all(userId) });
  }, [client, userId]));
}
