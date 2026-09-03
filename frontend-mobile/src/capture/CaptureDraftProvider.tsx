import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

import type { NativeImageAsset } from './types';

export type CaptureDraftDestination = 'library' | 'session';

export type CaptureDraft = {
  asset: NativeImageAsset;
  destination: CaptureDraftDestination;
};

type CaptureDraftContextValue = {
  draft: CaptureDraft | null;
  clearDraft: () => void;
  setDraft: (
    asset: NativeImageAsset,
    destination?: CaptureDraftDestination,
  ) => void;
};

const CaptureDraftContext = createContext<CaptureDraftContextValue | null>(null);

export function CaptureDraftProvider({ children }: PropsWithChildren) {
  const [draft, setDraftState] = useState<CaptureDraft | null>(null);
  const clearDraft = useCallback(() => setDraftState(null), []);
  const setDraft = useCallback((
    asset: NativeImageAsset,
    destination: CaptureDraftDestination = 'library',
  ) => setDraftState({ asset, destination }), []);
  const value = useMemo(
    () => ({ draft, clearDraft, setDraft }),
    [clearDraft, draft, setDraft],
  );

  return (
    <CaptureDraftContext.Provider value={value}>
      {children}
    </CaptureDraftContext.Provider>
  );
}

export function useCaptureDraft(): CaptureDraftContextValue {
  const context = useContext(CaptureDraftContext);
  if (!context) {
    throw new Error('useCaptureDraft must be used inside CaptureDraftProvider.');
  }
  return context;
}
