import { useCallback, useEffect, useRef, useState } from 'react';

import {
  MOBILE_API_BASE_URL,
  mobileArtworkLibraryService,
} from '../api/runtime';
import {
  presentRequestError,
  type RequestErrorPresentation,
} from '../api/requestErrorPresentation';
import type { MobileArtworkRecord } from '../library/types';

const PAGE_SIZE = 30;
const LOAD_ERROR = 'Musee could not load your library.';

function presentPickerError(error: unknown): RequestErrorPresentation {
  return presentRequestError(error, {
    apiBaseUrl: MOBILE_API_BASE_URL,
    fallbackMessage: LOAD_ERROR,
    showTechnicalDetails: __DEV__,
  });
}

export function useArtworkPicker(userId: string, visible: boolean) {
  const requestVersion = useRef(0);
  const [items, setItems] = useState<MobileArtworkRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<RequestErrorPresentation | null>(null);

  const reload = useCallback(async () => {
    if (!userId) return;
    const version = ++requestVersion.current;
    setItems([]);
    setError(null);
    setIsLoading(true);
    setIsLoadingMore(false);
    try {
      const page = await mobileArtworkLibraryService.fetchPage(userId, 0, PAGE_SIZE);
      if (version !== requestVersion.current) return;
      setItems(page.items);
      setTotal(page.total);
    } catch (loadError) {
      if (version === requestVersion.current) setError(presentPickerError(loadError));
    } finally {
      if (version === requestVersion.current) setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (visible) void reload();
    return () => {
      requestVersion.current += 1;
    };
  }, [reload, visible]);

  const loadMore = useCallback(async () => {
    if (isLoading || isLoadingMore || items.length >= total) return;
    const version = requestVersion.current;
    setIsLoadingMore(true);
    setError(null);
    try {
      const page = await mobileArtworkLibraryService.fetchPage(
        userId,
        items.length,
        PAGE_SIZE,
      );
      if (version !== requestVersion.current) return;
      setItems((current) => {
        const knownIds = new Set(current.map((item) => item.id));
        return [...current, ...page.items.filter((item) => !knownIds.has(item.id))];
      });
      setTotal(page.total);
    } catch (loadError) {
      if (version === requestVersion.current) setError(presentPickerError(loadError));
    } finally {
      if (version === requestVersion.current) setIsLoadingMore(false);
    }
  }, [isLoading, isLoadingMore, items.length, total, userId]);

  return {
    error,
    isLoading,
    isLoadingMore,
    items,
    loadMore,
    reload,
  };
}
