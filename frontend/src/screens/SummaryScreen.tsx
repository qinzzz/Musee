import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Dimensions,
  Animated,
  Keyboard,
  TouchableWithoutFeedback,
  Text,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraRoll } from '@react-native-camera-roll/camera-roll';
import { colors } from '../constants/colors';
import { spacing, borderRadius, shadows } from '../constants/theme';
import { FramedArtworkCard, Typography, ActionButton } from '../components';

interface SummaryScreenProps {
  photoUri: string;
  artistName: string;
  onBack: () => void;
  onSaveComplete?: () => void;
}

const { width, height } = Dimensions.get('window');

export default function SummaryScreen({
  photoUri,
  artistName,
  onBack,
  onSaveComplete
}: SummaryScreenProps) {
  const safeAreaInsets = useSafeAreaInsets();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const [isSaving, setIsSaving] = useState(false);

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
    if (isSaving) return;

    setIsSaving(true);
    try {
      // Save to camera roll in "Musee" album
      await CameraRoll.saveAsset(photoUri, {
        type: 'photo',
        album: 'Musee',
      });
    } catch (error) {
      console.error('Error saving photo:', error);
      Alert.alert(
        'Error',
        'Failed to save photo. Please check permissions.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={[styles.container, { paddingTop: safeAreaInsets.top }]}>
        {/* Save Button */}
        <View style={[styles.saveButton, { top: safeAreaInsets.top + spacing.md }]}>
          <ActionButton
            label={isSaving ? 'Saving...' : 'Done'}
            onPress={handleSave}
            disabled={isSaving}
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

          {/* Thoughts Section */}
          <View style={styles.thoughtsCardOuter}>
            <View style={styles.thoughtsCardInner}>
              <View style={styles.thoughtsCard}>
                <View style={styles.thoughtsHandle} />
                <TextInput
                  style={styles.thoughtsInput}
                  placeholder="Thoughts..."
                  placeholderTextColor="rgba(0, 0, 0, 0.2)"
                  multiline
                  numberOfLines={6}
                  textAlignVertical="top"
                />
              </View>
            </View>
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
  saveButton: {
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
  iconContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: 250,
    gap: spacing.md,
    marginBottom: spacing['4xl'],
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
  thoughtsCardOuter: {
    ...shadows.cardDarkShadow,
  },
  thoughtsCardInner: {
    ...shadows.cardLightShadow,
  },
  thoughtsCard: {
    width: width - 54,
    backgroundColor: '#F1F1F1',
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    minHeight: 500,
    alignItems: 'center',
  },
  thoughtsHandle: {
    width: 80,
    height: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 2,
    marginBottom: spacing.lg,
  },
  thoughtsInput: {
    width: '100%',
    fontSize: 16,
    fontFamily: 'SF Pro',
    fontWeight: '500',
    color: colors.black,
    letterSpacing: 0.32,
    textTransform: 'capitalize',
    minHeight: 160,
  },
});
