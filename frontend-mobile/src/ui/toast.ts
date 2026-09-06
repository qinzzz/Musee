import type { SymbolViewProps } from 'expo-symbols';

export type ToastTone = 'success' | 'neutral' | 'danger';

export type ToastContent = {
  label: string;
  icon?: SymbolViewProps['name'];
  loading?: boolean;
  tone?: ToastTone;
};

export type ShowToastOptions = ToastContent & {
  durationMs?: number;
};

export type ToastState = {
  label: string;
  icon: SymbolViewProps['name'];
  loading: boolean;
  tone: ToastTone;
  visible: boolean;
};

type ToastListener = (state: ToastState) => void;

const listeners = new Set<ToastListener>();
let state: ToastState = {
  label: '',
  icon: 'checkmark',
  loading: false,
  tone: 'success',
  visible: false,
};
let hideTimer: ReturnType<typeof setTimeout> | null = null;

function visibleState({
  label,
  icon = 'checkmark',
  loading = false,
  tone = 'success',
}: ToastContent): ToastState {
  return { label, icon, loading, tone, visible: true };
}

function publish(nextState: ToastState): void {
  state = nextState;
  listeners.forEach((listener) => listener(state));
}

function clearHideTimer(): void {
  if (!hideTimer) return;
  clearTimeout(hideTimer);
  hideTimer = null;
}

export function subscribeToast(listener: ToastListener): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

export function showToast({ durationMs = 2600, ...content }: ShowToastOptions): void {
  clearHideTimer();
  publish(visibleState(content));
  hideTimer = setTimeout(hideToast, durationMs);
}

export function showPersistentToast(content: ToastContent): void {
  clearHideTimer();
  publish(visibleState(content));
}

export function showPendingToast(content: Omit<ToastContent, 'loading'>): void {
  clearHideTimer();
  publish(visibleState({ ...content, loading: true, tone: content.tone ?? 'neutral' }));
}

export function hideToast(): void {
  clearHideTimer();
  publish({ ...state, visible: false });
}
