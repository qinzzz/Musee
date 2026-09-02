import { CameraView, useCameraPermissions } from 'expo-camera';
import { File } from 'expo-file-system';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
import { colors, radii, spacing, typography } from '../../ui/tokens/theme';

const COPY = {
  close: 'Close',
  permissionHeading: 'Camera access is off',
  permissionMessage: 'Allow Musee to use the camera so you can capture an artwork.',
  enableCamera: 'Enable Camera',
  openSettings: 'Open Settings',
  unavailableHeading: 'Camera unavailable',
  unavailableMessage: 'The camera is not available on this device. You can still choose a photo.',
  choosePhoto: 'Choose from Photos',
  retake: 'Retake',
  usePhoto: 'Use Photo',
  retrySave: 'Try saving again',
  continueWithoutSaving: 'Continue without saving',
  captureError: 'Musee could not take this photo. Please try again.',
  saveError: 'Musee could not save this photo to Photos. You can continue without saving it.',
  framingHint: 'Keep the full artwork inside the frame',
} as const;

export default function CameraScreen() {
  const router = useRouter();
  const { setDraft } = useCaptureDraft();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission, refreshPermission] = useCameraPermissions();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [capturedAsset, setCapturedAsset] = useState<NativeImageAsset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [allowUnsavedPhoto, setAllowUnsavedPhoto] = useState(false);

  useEffect(() => {
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
      if (state === 'active') void refreshPermission();
    });
    return () => subscription.remove();
  }, [refreshPermission]);

  const finishWithAsset = (asset: NativeImageAsset) => {
    setDraft(asset);
    router.back();
  };

  const choosePhoto = async () => {
    setError(null);
    try {
      const asset = await pickArtworkImage();
      if (asset) finishWithAsset(asset);
    } catch (pickError) {
      setError(pickError instanceof Error ? pickError.message : COPY.captureError);
    }
  };

  const takePhoto = async () => {
    if (!cameraRef.current || !cameraReady || capturing) return;
    setCapturing(true);
    setError(null);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
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
    if (!capturedAsset || saving) return;
    setSaving(true);
    setError(null);
    setShowSettings(false);
    setAllowUnsavedPhoto(false);
    try {
      await saveCapturedImage(expoCameraRollAdapter, capturedAsset.uri);
      finishWithAsset(capturedAsset);
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
        <ActivityIndicator color={colors.onPrimary} />
      </View>
    );
  }

  if (!available || !permission.granted) {
    const permissionBlocked = !permission.granted && !permission.canAskAgain;
    return (
      <SafeAreaView style={styles.permissionScreen}>
        <StatusBar style="light" />
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.closeButton}
        >
          <Text style={styles.closeLabel}>{COPY.close}</Text>
        </Pressable>
        <View style={styles.permissionContent}>
          <Text style={styles.permissionHeading}>
            {!available ? COPY.unavailableHeading : COPY.permissionHeading}
          </Text>
          <Text style={styles.permissionMessage}>
            {!available ? COPY.unavailableMessage : COPY.permissionMessage}
          </Text>
          {available ? (
            <MuseeButton
              label={permissionBlocked ? COPY.openSettings : COPY.enableCamera}
              onPress={() => void (
                permissionBlocked ? Linking.openSettings() : requestPermission()
              )}
            />
          ) : null}
          <MuseeButton
            label={COPY.choosePhoto}
            onPress={() => void choosePhoto()}
            variant="secondary"
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.cameraScreen}>
      <StatusBar style="light" />
      {capturedAsset ? (
        <Image
          accessibilityLabel="Captured artwork preview"
          contentFit="contain"
          source={{ uri: capturedAsset.uri }}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <CameraView
          active={!capturedAsset}
          facing="back"
          mode="picture"
          onCameraReady={() => setCameraReady(true)}
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
        />
      )}

      <SafeAreaView pointerEvents="box-none" style={styles.overlay}>
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            style={styles.closeButton}
          >
            <Text style={styles.closeLabel}>{COPY.close}</Text>
          </Pressable>
        </View>

        {!capturedAsset ? (
          <View pointerEvents="none" style={styles.guideArea}>
            <View style={styles.guideFrame} />
            <Text style={styles.framingHint}>{COPY.framingHint}</Text>
          </View>
        ) : <View style={styles.guideArea} />}

        <View style={styles.controls}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {capturedAsset ? (
            <View style={styles.previewActions}>
              {showSettings ? (
                <MuseeButton
                  label={COPY.openSettings}
                  onPress={() => void Linking.openSettings()}
                  variant="secondary"
                />
              ) : null}
              <MuseeButton
                label={allowUnsavedPhoto ? COPY.retrySave : COPY.usePhoto}
                loading={saving}
                onPress={() => void usePhoto()}
              />
              {allowUnsavedPhoto ? (
                <MuseeButton
                  label={COPY.continueWithoutSaving}
                  onPress={() => finishWithAsset(capturedAsset)}
                  variant="secondary"
                />
              ) : null}
              <MuseeButton
                disabled={saving}
                label={COPY.retake}
                onPress={retake}
                variant="secondary"
              />
            </View>
          ) : (
            <View style={styles.captureControls}>
              <Pressable
                accessibilityLabel="Take photo"
                accessibilityRole="button"
                disabled={!cameraReady || capturing}
                onPress={() => void takePhoto()}
                style={({ pressed }) => [
                  styles.shutter,
                  pressed && styles.shutterPressed,
                  (!cameraReady || capturing) && styles.disabled,
                ]}
              >
                <View style={styles.shutterInner} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => void choosePhoto()}
                style={styles.photoLibraryButton}
              >
                <Text style={styles.photoLibraryLabel}>{COPY.choosePhoto}</Text>
              </Pressable>
            </View>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
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
  overlay: {
    flex: 1,
  },
  topBar: {
    alignItems: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  closeButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  closeLabel: {
    color: colors.onPrimary,
    fontSize: typography.label,
    fontWeight: '600',
  },
  guideArea: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  guideFrame: {
    aspectRatio: 0.8,
    maxHeight: '76%',
    borderColor: 'rgba(255, 255, 255, 0.72)',
    borderRadius: radii.input,
    borderWidth: 1,
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
    minHeight: 170,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: 'rgba(0, 0, 0, 0.76)',
  },
  captureControls: {
    alignItems: 'center',
    gap: spacing.md,
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
  photoLibraryButton: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  photoLibraryLabel: {
    color: colors.onPrimary,
    fontSize: typography.label,
    fontWeight: '600',
  },
  previewActions: {
    gap: spacing.sm,
  },
  error: {
    color: '#FFD0C7',
    fontSize: typography.label,
    lineHeight: 20,
    textAlign: 'center',
  },
  permissionScreen: {
    flex: 1,
    backgroundColor: '#000000',
    paddingHorizontal: spacing.md,
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
