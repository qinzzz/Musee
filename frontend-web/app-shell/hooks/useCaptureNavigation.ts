import { useCallback, useRef, useState } from 'react';
import {
  buildCaptureHistoryState,
  buildRootHistoryState,
  stateToPath,
  type AppTab,
  type CollectTab,
} from '../../lib/appNavigation';

export type CaptureState = { key: number; hasUnsavedCaptures: boolean } | null;

type UseCaptureNavigationOptions = {
  activeTab: AppTab;
  collectTab: CollectTab;
};

export function useCaptureNavigation({
  activeTab,
  collectTab,
}: UseCaptureNavigationOptions) {
  const allowNextCaptureExitRef = useRef(false);
  const pendingCaptureExitActionRef = useRef<(() => void) | null>(null);
  const [captureState, setCaptureState] = useState<CaptureState>(
    window.history.state?.view === 'capture' || window.location.pathname === '/capture'
      ? { key: Date.now(), hasUnsavedCaptures: false }
      : null,
  );
  const [showCaptureExitModal, setShowCaptureExitModal] = useState(false);

  const requestLeaveCapture = useCallback((onConfirmLeave: () => void) => {
    if (!captureState?.hasUnsavedCaptures) {
      onConfirmLeave();
      return true;
    }
    pendingCaptureExitActionRef.current = onConfirmLeave;
    setShowCaptureExitModal(true);
    return false;
  }, [captureState?.hasUnsavedCaptures]);

  const cancelCaptureExit = useCallback(() => {
    pendingCaptureExitActionRef.current = null;
    setShowCaptureExitModal(false);
  }, []);

  const confirmCaptureExit = useCallback(() => {
    const pendingAction = pendingCaptureExitActionRef.current;
    pendingCaptureExitActionRef.current = null;
    setShowCaptureExitModal(false);
    pendingAction?.();
  }, []);

  const handleRequestLeaveCapture = useCallback(() => {
    if (allowNextCaptureExitRef.current) {
      allowNextCaptureExitRef.current = false;
      pendingCaptureExitActionRef.current = null;
      setShowCaptureExitModal(false);
      setCaptureState(null);
      return true;
    }

    return requestLeaveCapture(() => {
      allowNextCaptureExitRef.current = true;
      window.history.back();
    });
  }, [requestLeaveCapture]);

  const openCapturePage = useCallback(() => {
    const nextState = { key: Date.now(), hasUnsavedCaptures: false };
    setCaptureState(nextState);
    window.history.pushState(
      buildCaptureHistoryState(activeTab, collectTab),
      '',
      '/capture',
    );
  }, [activeTab, collectTab]);

  const closeCapturePage = useCallback(() => {
    void requestLeaveCapture(() => {
      if (window.history.state?.view === 'capture') {
        allowNextCaptureExitRef.current = true;
        window.history.back();
        return;
      }

      setCaptureState(null);
      window.history.pushState(
        buildRootHistoryState(activeTab, collectTab),
        '',
        stateToPath(activeTab, collectTab),
      );
    });
  }, [activeTab, collectTab, requestLeaveCapture]);

  const handleCaptureDirtyChange = useCallback((hasUnsavedCaptures: boolean) => {
    setCaptureState((current) => {
      if (!current || current.hasUnsavedCaptures === hasUnsavedCaptures) {
        return current;
      }
      return { ...current, hasUnsavedCaptures };
    });
  }, []);

  const exitCaptureAfterSubmit = useCallback(() => {
    if (window.history.state?.view === 'capture') {
      allowNextCaptureExitRef.current = true;
      window.history.back();
      return;
    }

    setCaptureState(null);
  }, []);

  return {
    captureState,
    setCaptureState,
    showCaptureExitModal,
    requestLeaveCapture,
    cancelCaptureExit,
    confirmCaptureExit,
    handleRequestLeaveCapture,
    openCapturePage,
    closeCapturePage,
    handleCaptureDirtyChange,
    exitCaptureAfterSubmit,
  };
}
