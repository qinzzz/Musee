import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { fetchUserMuseums } from '../../api/museums';
import { queryKeys } from '../../lib/queryClient';

type Options = {
  userId?: string | null;
  enabled?: boolean;
  invalidationKey?: string;
};

export function useUserMuseums({ userId, enabled = true, invalidationKey = 'default' }: Options) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.museums(userId || ''),
    queryFn: () => fetchUserMuseums(userId as string),
    enabled: Boolean(userId) && enabled,
  });

  const lastInvalidationKeyRef = useRef(invalidationKey);
  useEffect(() => {
    if (lastInvalidationKeyRef.current === invalidationKey) return;
    lastInvalidationKeyRef.current = invalidationKey;
    if (userId) void queryClient.invalidateQueries({ queryKey: queryKeys.museums(userId) });
  }, [invalidationKey, queryClient, userId]);

  return {
    museums: query.data?.items ?? [],
    isLoading: Boolean(userId) && enabled && query.isPending,
    error: enabled ? ((query.error as Error | null) ?? null) : null,
  };
}
