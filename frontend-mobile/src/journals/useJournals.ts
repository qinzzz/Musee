import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { mobileJournalService } from '../api/runtime';

export const journalKeys = {
  list: (userId: string) => ['journals', userId, 'list'] as const,
};

export function useJournals(userId: string) {
  const client = useQueryClient();
  useFocusEffect(useCallback(() => {
    if (userId) void client.invalidateQueries({ queryKey: journalKeys.list(userId) });
  }, [client, userId]));
  return useQuery({
    queryKey: journalKeys.list(userId),
    queryFn: () => mobileJournalService.list(userId),
    enabled: !!userId,
  });
}
