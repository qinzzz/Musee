import { useQuery } from '@tanstack/react-query';
import { fetchAccountUsage } from '../../api/account';
import { queryKeys } from '../../lib/queryClient';

// Account tier + quota usage, backend-owned. Consumers mount this where
// freshness matters (e.g. the user menu, which remounts on open), so the
// default stale-on-mount refetch keeps meters current without any manual
// invalidation wiring.
export function useAccountUsageQuery(userId: string | null | undefined, options?: { enabled?: boolean }) {
  const query = useQuery({
    queryKey: queryKeys.accountUsage(userId || ''),
    queryFn: () => fetchAccountUsage(userId as string),
    enabled: Boolean(userId) && (options?.enabled ?? true),
  });

  return {
    usage: query.data,
    usageLoading: query.isPending,
  };
}
