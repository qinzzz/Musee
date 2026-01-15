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
import { colors } from '../constants/colors';
import { spacing } from '../constants/theme';
import { FramedArtworkCard, ActionButton } from '../components';
import { savedArtworkApiService, ConversationMessage } from '../services/savedArtworkApi';
import { historyCacheService } from '../services/historyCache';
import { artworkSummaryCache } from '../utils/artworkSummaryCache';
import { useLanguage } from '../contexts/LanguageContext';

type SaveStatus = 'unsaved' | 'saving' | 'saved';

export default function SummaryScreen({ route, navigation }: any) {
  const {
    photoUri,
    artistName,
    artworkName = 'Untitled',
    savedArtworkId,
    conversationHistory = []
  } = route.params;
  const safeAreaInsets = useSafeAreaInsets();
  const { language } = useLanguage();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('unsaved');
  const [dbSaved, setDbSaved] = useState(false);
  const [summary, setSummary] = useState<string>('');
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);

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

    // Artwork is already saved to database in ArtworkAnalysisScreen
    // All conversations are automatically saved via backend on each /analyze-bite call
    // Just invalidate cache to ensure gallery shows latest data
    historyCacheService.invalidateCache();
    setDbSaved(true);

    // Generate artwork summary when screen mounts
    generateSummary();

  }, []);

  const generateSummary = async () => {
    console.log('[SummaryScreen] Generating summary for artwork:', savedArtworkId);
    if (!savedArtworkId) return;

    try {
      setIsGeneratingSummary(true);

      // Check if we already have a cached summary or request in progress
      const cached = artworkSummaryCache.get(savedArtworkId);

      let result;
      if (cached?.data) {
        // Data already available from cache
        console.log('[SummaryScreen] Using cached summary data');
        result = { summary: cached.data };
      } else if (cached?.promise) {
        // Request already in progress, wait for it
        console.log('[SummaryScreen] Waiting for in-progress summary generation...');
        result = await cached.promise;
      } else {
        // No cache, make new request
        console.log('[SummaryScreen] Making new summary request');
        const summaryPromise = savedArtworkApiService.generateArtworkSummary(savedArtworkId, photoUri, language);

        // Cache the promise so other components can await it
        artworkSummaryCache.set(savedArtworkId, summaryPromise);

        result = await summaryPromise;
      }

      setSummary(result.summary);
      console.log('[SummaryScreen] Summary set successfully:', result.summary);
    } catch (error) {
      console.error('[SummaryScreen] Failed to generate summary:', error);
      // Clear the cache on error so retry will make a fresh request
      if (savedArtworkId) {
        artworkSummaryCache.clear(savedArtworkId);
      }
    } finally {
      setIsGeneratingSummary(false);
    }
  };

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

  const handleDone = () => {
    navigation.navigate('History');
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

          {/* Summary */}
          {isGeneratingSummary && (
            <View style={styles.summaryContainer}>
              <Text style={styles.summaryText}>Generating summary...</Text>
            </View>
          )}
          {!isGeneratingSummary && summary && (
            <View style={styles.summaryContainer}>
              <Text style={styles.summaryText}>{summary}</Text>
            </View>
          )}

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
  summaryContainer: {
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing['2xl'],
    alignItems: 'center',
  },
  summaryText: {
    fontFamily: 'IBM Plex Mono',
    fontSize: 16,
    fontWeight: '300',
    fontStyle: 'italic',
    color: colors.darkGrey,
    textAlign: 'center',
    lineHeight: 24,
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
