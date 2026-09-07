import { createContext, useContext, useMemo, type PropsWithChildren } from 'react';
import type { SessionContextInput } from './mobileSessionContextService';

type Draft = { text: string; inputs: SessionContextInput[] };
type DraftStore = { set: (draft: Draft) => void; take: () => Draft | null };
const Context = createContext<DraftStore | null>(null);
export function createSessionDraftStore(): DraftStore {
  let draft: Draft | null = null;
  return {
    set: (value) => { draft = value; },
    take: () => { const value = draft; draft = null; return value; },
  };
}
export function SessionDraftProvider({ children }: PropsWithChildren) {
  const store = useMemo(createSessionDraftStore, []);
  return <Context.Provider value={store}>{children}</Context.Provider>;
}
export function useSessionDraft() {
  const store = useContext(Context);
  if (!store) throw new Error('SessionDraftProvider is missing');
  return store;
}
