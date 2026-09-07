import { useCallback, useRef, useState } from 'react';

// Background query revalidation must not activate the native pull gesture UI.
export function usePullToRefresh(refresh: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);
  const pending = useRef(false);
  const onRefresh = useCallback(async () => {
    if (pending.current) return;
    pending.current = true;
    setRefreshing(true);
    try {
      await refresh();
    } catch {
      // Query observers own visible errors and retry actions.
    } finally {
      pending.current = false;
      setRefreshing(false);
    }
  }, [refresh]);
  return { refreshing, onRefresh };
}
