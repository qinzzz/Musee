import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Device from 'expo-device';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { NativeImageValidationError } from './nativeImageAsset';
import type { NativeImageAsset } from './types';
import { pickArtworkImage } from '../platform/images/pickArtworkImage';
import { cameraPhotoAsset } from '../platform/images/cameraPhotoAsset';
import { CameraRollPermissionError, saveCapturedImage } from '../platform/media/cameraRoll';
import { expoCameraRollAdapter } from '../platform/media/expoCameraRollAdapter';
import { CAMERA_COPY as COPY } from './cameraCopy';

export function useCameraCapture(onComplete: (asset: NativeImageAsset, label?: NativeImageAsset) => void, onClose: () => void) {
  const exited = useRef(false);
  const running = useRef(false);
  useEffect(() => {
    exited.current = false;
    return () => { exited.current = true; };
  }, []);
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission, refreshPermission] = useCameraPermissions();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [capturing, setCapturing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTarget, setActiveTarget] = useState<'artwork' | 'label'>('artwork');
  const [artworkAsset, setArtworkAsset] = useState<NativeImageAsset | null>(null);
  const [labelAsset, setLabelAsset] = useState<NativeImageAsset | null>(null);
  const [picking, setPicking] = useState(false);
  const busy = capturing || saving || picking;
  const capturedAsset = activeTarget === 'artwork' ? artworkAsset : labelAsset;
  const setCapturedAsset = (asset: NativeImageAsset | null) => {
    if (asset) setCameraReady(false);
    if (activeTarget === 'artwork') setArtworkAsset(asset);
    else setLabelAsset(asset);
  };
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [allowUnsavedPhoto, setAllowUnsavedPhoto] = useState(false);

  useEffect(() => {
    if (Device.isDevice) {
      setAvailable(true);
      return undefined;
    }

    let active = true;
    void CameraView.isAvailableAsync()
      .then((isAvailable) => {
        if (active) setAvailable(isAvailable);
      })
      .catch(() => {
        if (active) setAvailable(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setAppActive(state === 'active');
      if (state === 'active') void refreshPermission();
    });
    return () => subscription.remove();
  }, [refreshPermission]);

  const leaveCamera = () => {
    if (exited.current) return;
    exited.current = true;
    onClose();
  };

  const finishWithAsset = (asset: NativeImageAsset) => {
    if (exited.current) return;
    onComplete(asset, labelAsset ?? undefined);
    leaveCamera();
  };

  const choosePhoto = async () => {
    if (exited.current || running.current) return;
    running.current = true;
    setPicking(true);
    setError(null);
    try {
      const asset = await pickArtworkImage();
      if (asset && !exited.current) setCapturedAsset(asset);
    } catch (pickError) {
      if (exited.current) return;
      setError(pickError instanceof Error ? pickError.message : COPY.captureError);
    } finally {
      running.current = false;
      if (!exited.current) setPicking(false);
    }
  };

  const takePhoto = async () => {
    if (!cameraRef.current || !cameraReady || exited.current || running.current) return;
    running.current = true;
    setCapturing(true);
    setError(null);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      if (exited.current) return;
      setCapturedAsset(cameraPhotoAsset(photo));
    } catch (captureError) {
      if (exited.current) return;
      setError(
        captureError instanceof NativeImageValidationError
          ? captureError.message
          : COPY.captureError,
      );
    } finally {
      running.current = false;
      if (!exited.current) setCapturing(false);
    }
  };

  const usePhoto = async () => {
    if (!artworkAsset || exited.current || running.current) return;
    running.current = true;
    setSaving(true);
    setError(null);
    setShowSettings(false);
    setAllowUnsavedPhoto(false);
    try {
      if (artworkAsset.source === 'camera') {
        await saveCapturedImage(expoCameraRollAdapter, artworkAsset.uri);
      }
      finishWithAsset(artworkAsset);
    } catch (saveError) {
      if (exited.current) return;
      setError(
        saveError instanceof CameraRollPermissionError
          ? saveError.message
          : COPY.saveError,
      );
      setShowSettings(
        saveError instanceof CameraRollPermissionError && !saveError.canAskAgain,
      );
      setAllowUnsavedPhoto(true);
    } finally {
      running.current = false;
      if (!exited.current) setSaving(false);
    }
  };

  const selectTarget = (target: 'artwork' | 'label') => {
    if (running.current || exited.current) return;
    setActiveTarget(target);
    setError(null);
    setAllowUnsavedPhoto(false);
    setShowSettings(false);
  };
  const retake = () => {
    setCapturedAsset(null);
    setError(null);
    setShowSettings(false);
    setAllowUnsavedPhoto(false);
  };

  return {
    available, permission, requestPermission, cameraRef, cameraReady, setCameraReady, setAvailable,
    appActive, capturing, saving, picking, busy, activeTarget, selectTarget,
    artworkAsset, labelAsset, capturedAsset, error, showSettings, allowUnsavedPhoto,
    leaveCamera, finishWithAsset, choosePhoto, takePhoto, usePhoto, retake,
  };
}
