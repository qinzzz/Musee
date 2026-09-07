import { describe, expect, it } from 'vitest';
import { createSessionDraftStore } from './SessionDraftProvider';

describe('Home to Session draft handoff', () => {
  it('consumes a submitted draft once so rerenders cannot submit duplicate turns', () => {
    const store = createSessionDraftStore();
    const draft = { text: 'Compare these', inputs: [] };
    store.set(draft);
    expect(store.take()).toBe(draft);
    expect(store.take()).toBeNull();
  });
  it('does not retain a previous authenticated navigation tree’s draft', () => {
    const previous = createSessionDraftStore();
    previous.set({ text: 'Private question', inputs: [] });
    expect(createSessionDraftStore().take()).toBeNull();
  });
});
