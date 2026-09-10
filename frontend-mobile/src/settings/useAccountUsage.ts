import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { mobileAccountService } from '../api/runtime';

export const accountKeys = {
  usage: (userId: string) => ['account', userId, 'usage'] as const,
};

export function useAccountUsage(userId: string) {
  const client = useQueryClient();
  useFocusEffect(useCallback(() => {
    if (userId) void client.invalidateQueries({ queryKey: accountKeys.usage(userId) });
  }, [client, userId]));
  return useQuery({
    queryKey: accountKeys.usage(userId),
    queryFn: () => mobileAccountService.usage(userId),
    enabled: !!userId,
  });
}
