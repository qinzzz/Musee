import { LoadingIndicator } from '../../ui/components/LoadingIndicator';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Device from 'expo-device';
import { File } from 'expo-file-system';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import {
  AppState,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCaptureDraft } from '../../capture/CaptureDraftProvider';
import {
  createCameraImageAsset,
  NativeImageValidationError,
} from '../../capture/nativeImageAsset';
import type { NativeImageAsset } from '../../capture/types';
import { pickArtworkImage } from '../../platform/images/pickArtworkImage';
import {
  CameraRollPermissionError,
  saveCapturedImage,
} from '../../platform/media/cameraRoll';
import { expoCameraRollAdapter } from '../../platform/media/expoCameraRollAdapter';
import { MuseeButton } from '../../ui/components/MuseeButton';
import { colors, spacing, typography } from '../../ui/tokens/theme';

const COPY = {
  close: 'Close',
  closeSymbol: '×',
  permissionHeading: 'Camera access is off',
  permissionMessage: 'Allow Musee to use the camera so you can capture an artwork.',
  enableCamera: 'Enable Camera',
  openSettings: 'Open Settings',
  unavailableHeading: 'Camera unavailable',
  unavailableMessage: 'The camera is not available on this device. You can still choose a photo.',
  choosePhoto: 'Choose from Photos',
  retake: 'Retake',
  usePhoto: 'Continue',
  nextArtwork: 'Take artwork',
  artwork: 'Artwork',
  label: 'Label',
  optional: 'Optional',
  captured: 'Captured',
  takeArtwork: 'Capture artwork',
  takeLabel: 'Capture label',
  previewArtwork: 'Artwork preview',
  previewLabel: 'Label preview',
  retrySave: 'Try saving again',
  continueWithoutSaving: 'Continue without saving',
  captureError: 'Musee could not take this photo. Please try again.',
  saveError: 'Musee could not save this photo to Photos. You can continue without saving it.',
} as const;

export default function CameraScreen() {
  const params = useLocalSearchParams<{ destination?: string | string[] }>();
  const destinationParam = Array.isArray(params.destination)
    ? params.destination[0]
    : params.destination;
  const destination = destinationParam === 'session' ? 'session' : 'library';
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const exited = useRef(false);
  useEffect(() => {
    exited.current = false;
    return () => { exited.current = true; };
  }, []);
  const { setDraft } = useCaptureDraft();
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
    if (router.canGoBack()) router.back();
    else router.replace(destination === 'session' ? '/' : '/artwork-upload');
  };

  const closeControl = (
    <Pressable accessibilityLabel={COPY.close} accessibilityRole="button"
      onPress={leaveCamera} disabled={busy} hitSlop={12}
      style={[styles.closeButton, styles.closeOverlay, { top: insets.top + spacing.md }]}>
      <Text style={styles.closeLabel}>{COPY.closeSymbol}</Text>
    </Pressable>
  );

  const finishWithAsset = (asset: NativeImageAsset) => {
    if (exited.current) return;
    setDraft(asset, destination, labelAsset ?? undefined);
    leaveCamera();
  };

  const choosePhoto = async () => {
    if (busy) return;
    setPicking(true);
    setError(null);
    try {
      const asset = await pickArtworkImage();
      if (asset && !exited.current) setCapturedAsset(asset);
    } catch (pickError) {
      setError(pickError instanceof Error ? pickError.message : COPY.captureError);
    } finally {
      setPicking(false);
    }
  };

  const takePhoto = async () => {
    if (!cameraRef.current || !cameraReady || busy) return;
    setCapturing(true);
    setError(null);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      if (exited.current) return;
      const file = new File(photo.uri);
      setCapturedAsset(createCameraImageAsset({
        ...photo,
        fileSize: file.size || undefined,
      }));
    } catch (captureError) {
      setError(
        captureError instanceof NativeImageValidationError
          ? captureError.message
          : COPY.captureError,
      );
    } finally {
      setCapturing(false);
    }
  };

  const usePhoto = async () => {
    if (!artworkAsset || busy) return;
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
      setSaving(false);
    }
  };

  const retake = () => {
    setCapturedAsset(null);
    setError(null);
    setShowSettings(false);
    setAllowUnsavedPhoto(false);
  };

  if (available === null || permission === null) {
    return (
      <View style={styles.centered}>
        <StatusBar style="light" />
        <LoadingIndicator color={colors.onPrimary} />
        {closeControl}
      </View>
    );
  }

  return (
    <View style={styles.cameraScreen}>
      <StatusBar style="light" />
      <View style={[styles.viewport, { marginTop: insets.top }]}>
      {capturedAsset ? (
        <Image
          accessibilityLabel={activeTarget === 'artwork' ? COPY.previewArtwork : COPY.previewLabel}
          contentFit="contain"
          source={{ uri: capturedAsset.uri }}
          style={StyleSheet.absoluteFill}
        />
      ) : available && permission.granted ? (
        <CameraView
          active={appActive}
          facing="back"
          mode="picture"
          onCameraReady={() => setCameraReady(true)}
          onMountError={() => { setCameraReady(false); setAvailable(false); }}
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <View style={styles.permissionContent}>
          <Text style={styles.permissionHeading}>{!available ? COPY.unavailableHeading : COPY.permissionHeading}</Text>
          <Text style={styles.permissionMessage}>{!available ? COPY.unavailableMessage : COPY.permissionMessage}</Text>
          {available ? <MuseeButton
            label={permission.canAskAgain ? COPY.enableCamera : COPY.openSettings}
            onPress={() => void (permission.canAskAgain ? requestPermission() : Linking.openSettings())}
            tone="inverse" /> : null}
        </View>
      )}

      </View>
      <View style={[styles.controls, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.actionRow}>
            <Pressable disabled={busy} accessibilityRole="button"
              accessibilityLabel={COPY.choosePhoto} accessibilityState={{ disabled: busy }}
              onPress={() => void choosePhoto()}
              style={({ pressed }) => [styles.sideAction, pressed && styles.shutterPressed, busy && styles.disabled]}>
              <SymbolView name="photo" size={26} tintColor={colors.onPrimary} />
            </Pressable>
            <View style={styles.primaryAction}>
              {capturedAsset ? (
                <MuseeButton disabled={busy}
                  label={artworkAsset ? (allowUnsavedPhoto ? COPY.retrySave : COPY.usePhoto) : COPY.nextArtwork}
                  loading={saving}
                  onPress={() => artworkAsset ? void usePhoto() : setActiveTarget('artwork')}
                  tone="inverse" />
              ) : available && permission.granted ? (
                <Pressable accessibilityLabel={activeTarget === 'artwork' ? COPY.takeArtwork : COPY.takeLabel}
                  accessibilityRole="button" accessibilityState={{ disabled: !cameraReady || busy, busy }}
                  disabled={!cameraReady || busy} onPress={() => void takePhoto()}
                  style={({ pressed }) => [styles.shutter, pressed && styles.shutterPressed,
                    (!cameraReady || busy) && styles.disabled]}>
                  <View style={styles.shutterInner} />
                </Pressable>
              ) : (
                <Text style={styles.framingHint}>{COPY.choosePhoto}</Text>
              )}
            </View>
            {capturedAsset ? (
              <Pressable disabled={busy} accessibilityRole="button"
                accessibilityLabel={COPY.retake}
                accessibilityState={{ disabled: busy }}
                onPress={retake}
                style={({ pressed }) => [styles.sideAction, pressed && styles.shutterPressed, busy && styles.disabled]}>
                <SymbolView name="arrow.counterclockwise"
                  size={24} tintColor={colors.onPrimary} />
              </Pressable>
            ) : artworkAsset ? (
              <Pressable disabled={busy} accessibilityRole="button" accessibilityLabel={COPY.usePhoto}
                accessibilityState={{ disabled: busy }} onPress={() => void usePhoto()}
                style={({ pressed }) => [styles.sideAction, pressed && styles.shutterPressed, busy && styles.disabled]}>
                {saving ? <LoadingIndicator color={colors.onPrimary} /> : (
                  <SymbolView name="arrow.right" size={26} tintColor={colors.onPrimary} />
                )}
              </Pressable>
            ) : <View style={styles.sideAction} />}
          </View>
          <View style={styles.slotRow}>
            {(['artwork', 'label'] as const).map((target) => {
              const asset = target === 'artwork' ? artworkAsset : labelAsset;
              return <Pressable key={target} accessibilityRole="button"
                accessibilityLabel={`${COPY[target]}${target === 'label' ? `, ${COPY.optional}` : ''}${asset ? `, ${COPY.captured}` : ''}`}
                accessibilityState={{ selected: activeTarget === target, disabled: busy }}
                disabled={busy}
                onPress={() => {
                  setActiveTarget(target);
                  setError(null);
                  setAllowUnsavedPhoto(false);
                  setShowSettings(false);
                }}
                style={[styles.slot, activeTarget === target && styles.selectedSlot]}>
                {asset ? <Image source={{ uri: asset.uri }} style={styles.slotThumbnail} /> : null}
                <Text style={[styles.slotLabel, activeTarget === target && styles.activeSlotLabel]}>{COPY[target]}{asset ? ' ✓' : ''}</Text>
                {target === 'label' && !asset ? <Text style={styles.optionalLabel}>{COPY.optional}</Text> : null}
              </Pressable>;
            })}
          </View>
          {showSettings ? <MuseeButton label={COPY.openSettings}
            onPress={() => void Linking.openSettings()} tone="inverse" variant="secondary" /> : null}
          {allowUnsavedPhoto && artworkAsset ? <MuseeButton
            label={COPY.continueWithoutSaving} disabled={busy}
            onPress={() => finishWithAsset(artworkAsset)} tone="inverse" variant="secondary" /> : null}
      </View>
      {closeControl}
    </View>
  );
}

const styles = StyleSheet.create({
  slotRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  slot: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  selectedSlot: { backgroundColor: 'rgba(255,255,255,0.16)' },
  slotLabel: { color: '#C8C8C8', fontSize: typography.label, fontWeight: '500' },
  activeSlotLabel: { color: colors.onPrimary, fontWeight: '600' },
  optionalLabel: { color: '#C8C8C8', fontSize: typography.caption },
  slotThumbnail: { width: 24, height: 24, borderRadius: 6 },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    minHeight: 88,
  },
  sideAction: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  primaryAction: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  viewport: { flex: 1, overflow: 'hidden', backgroundColor: '#000000' },
  cameraScreen: {
    flex: 1,
    backgroundColor: '#000000',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
  },
  closeOverlay: {
    position: 'absolute',
    left: spacing.md,
    zIndex: 10,
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.48)',
  },
  closeLabel: {
    color: colors.onPrimary,
    fontSize: 30,
    fontWeight: '300',
    lineHeight: 32,
  },
  framingHint: {
    color: colors.onPrimary,
    fontSize: typography.caption,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.72)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  controls: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    backgroundColor: '#000000',
  },
  shutter: {
    width: 74,
    height: 74,
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: colors.onPrimary,
    borderRadius: 37,
    borderWidth: 4,
  },
  shutterInner: {
    width: 58,
    height: 58,
    backgroundColor: colors.onPrimary,
    borderRadius: 29,
  },
  shutterPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.96 }],
  },
  disabled: {
    opacity: 0.5,
  },
  error: {
    color: '#FFD0C7',
    fontSize: typography.label,
    lineHeight: 20,
    textAlign: 'center',
  },
  permissionContent: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  permissionHeading: {
    color: colors.onPrimary,
    fontSize: typography.heading,
    fontWeight: '600',
  },
  permissionMessage: {
    color: '#D8D3C9',
    fontSize: typography.body,
    lineHeight: 24,
    marginBottom: spacing.sm,
  },
});
