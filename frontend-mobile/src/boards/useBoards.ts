import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { MOBILE_API_BASE_URL, mobileBoardService } from '../api/runtime';
import { presentRequestError } from '../api/requestErrorPresentation';
import { showPendingToast, showToast } from '../ui/toast';
import { boardKeys, cacheBoard, uncacheBoard } from './boardQueries';
import type { BoardUpdates } from '@musee/client-core';

const COPY = {
  error: 'Musee could not update this board. Please try again.',
  creating: 'Creating board…', created: 'Board created',
  updating: 'Updating board…', updated: 'Board updated',
  deleting: 'Deleting board…', deleted: 'Board deleted',
};

export function useBoardRefresh(userId: string) {
  const client = useQueryClient();
  useFocusEffect(useCallback(() => {
    if (userId) void client.invalidateQueries({ queryKey: boardKeys.all(userId) });
  }, [client, userId]));
}

export function useBoardActions(userId: string) {
  const client = useQueryClient();
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run<T>(pending: string, success: string, work: () => Promise<T>): Promise<T | undefined> {
    if (!userId || running.current) return undefined;
    running.current = true;
    setBusy(true);
    setError(null);
    showPendingToast({ label: pending });
    try {
      // Cancel stale reads before and after mutation so they cannot overwrite the result.
      await client.cancelQueries({ queryKey: boardKeys.all(userId) });
      const result = await work();
      showToast({ label: success });
      return result;
    } catch (cause) {
      const message = presentRequestError(cause, {
        apiBaseUrl: MOBILE_API_BASE_URL, fallbackMessage: COPY.error, showTechnicalDetails: __DEV__,
      }).message;
      setError(message);
      showToast({ label: message, tone: 'danger', icon: 'exclamationmark' });
      return undefined;
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return {
    busy, error,
    create: (name: string) => run(COPY.creating, COPY.created, async () => {
      const board = await mobileBoardService.create(userId, name);
      await client.cancelQueries({ queryKey: boardKeys.all(userId) });
      cacheBoard(client, userId, board);
      return board;
    }),
    update: (id: string, updates: BoardUpdates) => run(COPY.updating, COPY.updated, async () => {
      const board = await mobileBoardService.update(userId, id, updates);
      await client.cancelQueries({ queryKey: boardKeys.all(userId) });
      cacheBoard(client, userId, board);
      return board;
    }),
    remove: (id: string) => run(COPY.deleting, COPY.deleted, async () => {
      await mobileBoardService.remove(userId, id);
      await client.cancelQueries({ queryKey: boardKeys.all(userId) });
      uncacheBoard(client, userId, id);
      return true;
    }),
  };
}
