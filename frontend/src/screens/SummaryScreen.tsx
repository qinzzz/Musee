import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Keyboard,
  TouchableWithoutFeedback,
  Text,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraRoll } from '@react-native-camera-roll/camera-roll';
import { colors } from '../constants/colors';
import { spacing } from '../constants/theme';
import { FramedArtworkCard, ActionButton } from '../components';
import { historyApiService } from '../services/historyApi';
import { historyCacheService } from '../services/historyCache';

interface SummaryScreenProps {
  photoUri: string;
  artistName: string;
  artworkName?: string;
  onBack: () => void;
  onSaveComplete?: () => void;
}

type SaveStatus = 'unsaved' | 'saving' | 'saved';


export default function SummaryScreen({
  photoUri,
  artistName,
  artworkName = 'Untitled',
  onBack,
  onSaveComplete
}: SummaryScreenProps) {
  const safeAreaInsets = useSafeAreaInsets();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('unsaved');

  useEffect(() => {
    // Fade in and slide up animation on mount
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleThumbsDown = () => {
    console.log('Thumbs down');
  };

  const handleThumbsUp = () => {
    console.log('Thumbs up');
  };

  const handleLike = () => {
    console.log('Like');
  };

  const handleAddToCollection = () => {
    console.log('Add to collection');
  };

  const handleSave = async () => {
    if (saveStatus !== 'unsaved') return;

    setSaveStatus('saving');
    try {
      // Save to camera roll in "Musee" album
      const savedAsset = await CameraRoll.saveAsset(photoUri, {
        type: 'photo',
        album: 'Musee',
      });

      // Save to backend history for faster retrieval
      const isRecognized = artistName.toLowerCase() !== 'unknown';
      await historyApiService.saveToHistory({
        photoUri: savedAsset.node.image.uri,
        artistName,
        artworkName,
        isRecognized,
      });

      // Invalidate cache to force refresh on next gallery load
      await historyCacheService.invalidateCache();

      setSaveStatus('saved');
      Alert.alert(
        'Success',
        'Photo saved to your gallery!',
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('Error saving photo:', error);
      Alert.alert(
        'Error',
        'Failed to save photo. Please check permissions.',
        [{ text: 'OK' }]
      );
      setSaveStatus('unsaved');
    }
  };

  const handleDone = () => {
    if (onSaveComplete) {
      onSaveComplete();
    }
  };

  const getSaveButtonLabel = () => {
    switch (saveStatus) {
      case 'saving':
        return 'Saving...';
      case 'saved':
        return 'Saved';
      default:
        return 'Save the photo';
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={[styles.container, { paddingTop: safeAreaInsets.top }]}>
        {/* Done Button */}
        <View style={[styles.doneButton, { top: safeAreaInsets.top + spacing.md }]}>
          <ActionButton
            label="Done"
            onPress={handleDone}
          />
        </View>

        <Animated.View
          style={[
            styles.content,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          {/* Framed Artwork Card */}
          <FramedArtworkCard
            photoUri={photoUri}
            style={styles.artworkCard}
          />

          {/* Save Photo Button */}
          <View style={styles.savePhotoButtonContainer}>
            <ActionButton
              label={getSaveButtonLabel()}
              onPress={handleSave}
              disabled={saveStatus !== 'unsaved'}
            />
          </View>

          {/* Action Icons */}
          <View style={styles.iconContainer}>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={handleThumbsDown}
              activeOpacity={0.7}
            >
              <Text style={styles.iconText}>↓</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.iconButton}
              onPress={handleThumbsUp}
              activeOpacity={0.7}
            >
              <Text style={styles.iconText}>↑</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.iconButton}
              onPress={handleLike}
              activeOpacity={0.7}
            >
              <Text style={styles.iconText}>♥</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.iconButton}
              onPress={handleAddToCollection}
              activeOpacity={0.7}
            >
              <Text style={styles.iconText}>+</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
  },
  doneButton: {
    position: 'absolute',
    right: spacing.xl,
    zIndex: 10,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    paddingTop: spacing['3xl'],
  },
  artworkCard: {
    marginTop: 50,
    marginBottom: spacing.lg,
  },
  savePhotoButtonContainer: {
    marginTop: spacing.lg,
    marginBottom: spacing['2xl'],
    alignItems: 'center',
  },
  iconContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: 250,
    gap: spacing.md,
    marginTop: spacing['2xl'],
    paddingRight: spacing.base,
  },
  iconButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: 28,
    lineHeight: 28,
  },
});
