import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  hideToast,
  showPendingToast,
  showPersistentToast,
  showToast,
  subscribeToast,
  type ToastState,
} from './toast';

describe('Musee toast state', () => {
  let current: ToastState;
  let unsubscribe: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    hideToast();
    unsubscribe = subscribeToast((nextState) => { current = nextState; });
  });

  afterEach(() => {
    unsubscribe();
    hideToast();
    vi.useRealTimers();
  });

  it('publishes custom content and automatically hides it', () => {
    showToast({ label: 'Artwork updated', icon: 'pencil', tone: 'success' });
    expect(current).toEqual({
      label: 'Artwork updated',
      icon: 'pencil',
      loading: false,
      tone: 'success',
      visible: true,
    });

    vi.advanceTimersByTime(2600);
    expect(current).toEqual({
      label: 'Artwork updated',
      icon: 'pencil',
      loading: false,
      tone: 'success',
      visible: false,
    });
  });

  it('keeps a preview visible until it is explicitly hidden', () => {
    showPersistentToast({
      label: 'Liquid Glass toast preview',
      icon: 'sparkles',
      loading: false,
      tone: 'neutral',
    });
    vi.advanceTimersByTime(10_000);
    expect(current).toEqual({
      label: 'Liquid Glass toast preview',
      icon: 'sparkles',
      loading: false,
      tone: 'neutral',
      visible: true,
    });

    hideToast();
    expect(current.visible).toBe(false);
  });

  it('keeps pending feedback visible until a result replaces it', () => {
    showPendingToast({ label: 'Deleting artwork…' });
    vi.advanceTimersByTime(10_000);
    expect(current).toEqual({
      label: 'Deleting artwork…',
      icon: 'checkmark',
      loading: true,
      tone: 'neutral',
      visible: true,
    });

    showToast({ label: 'Artwork deleted', icon: 'trash' });
    expect(current).toMatchObject({
      label: 'Artwork deleted',
      loading: false,
      visible: true,
    });
    vi.advanceTimersByTime(2600);
    expect(current.visible).toBe(false);
  });
});
