import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

import type { NativeImageAsset } from './types';

type CaptureDraftContextValue = {
  draft: NativeImageAsset | null;
  clearDraft: () => void;
  setDraft: (asset: NativeImageAsset) => void;
};

const CaptureDraftContext = createContext<CaptureDraftContextValue | null>(null);

export function CaptureDraftProvider({ children }: PropsWithChildren) {
  const [draft, setDraftState] = useState<NativeImageAsset | null>(null);
  const clearDraft = useCallback(() => setDraftState(null), []);
  const setDraft = useCallback((asset: NativeImageAsset) => setDraftState(asset), []);
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
