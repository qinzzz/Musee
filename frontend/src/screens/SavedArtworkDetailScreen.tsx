import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  Animated,
  PanResponder,
  ScrollView,
  TouchableOpacity,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';
import { API_BASE_URL, API_ENDPOINTS } from '../constants/api';
import {
  Typography,
  Heading2,
  LoadingProgressBar,
  SavedArtistCard,
  ActionButton,
  TopicChip,
  ArtworkBite,
  Toast,
  ArtworkImageContainer,
  MoreIcon,
  ArrowIcon
} from '../components';
import { spacing, shadows, borderRadius, animations } from '../constants/theme';
import { savedArtworkApiService, SavedArtwork } from '../services/savedArtworkApi';
import { getColors } from 'react-native-image-colors';
import { softenColor, getOppositeColor } from '../utils/colorUtils';
import { compressImage, getCompressionSettings } from '../utils/imageUtils';

interface SavedArtworkDetailScreenProps {
  artworkId: string;
  onBack: () => void;
  initialPhotoUri?: string;
  initialBackgroundColor?: string;
}

const { width, height } = Dimensions.get('window');

export default function SavedArtworkDetailScreen({
  artworkId,
  onBack,
  initialPhotoUri,
  initialBackgroundColor,
}: SavedArtworkDetailScreenProps) {
  const safeAreaInsets = useSafeAreaInsets();
  const [artwork, setArtwork] = useState<SavedArtwork | null>(null);
  const [isLoading, setIsLoading] = useState(!initialPhotoUri); // Don't show loading if we have initial photo
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Exploration and conversation states
  const [artworkBites, setArtworkBites] = useState<Array<{ content: string; topic?: string; role?: 'user' | 'assistant' }>>([]);
  const [isBiteLoading, setIsBiteLoading] = useState(false);
  const [isTopicLoading, setIsTopicLoading] = useState(false);
  const [suggestedTopics, setSuggestedTopics] = useState<string[]>([]);
  const [currentSelectedTopic, setCurrentSelectedTopic] = useState<string | null>(null);

  // Menu states
  const [showMenu, setShowMenu] = useState(false);

  // Toast states
  const [showToast, setShowToast] = useState(false);

  // Track which view is currently visible
  const [isExplorationVisible, setIsExplorationVisible] = useState(false);
  const isExplorationVisibleRef = useRef(false); // Ref for pan responder to access current value

  // Track keyboard state
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  // Background color state - use initial color if provided
  const [backgroundColor, setBackgroundColor] = useState(initialBackgroundColor || colors.background);

  // Photo URI state - use initial photo if provided
  const [photoUri, setPhotoUri] = useState(initialPhotoUri || '');

  // Swipe gesture
  const swipeTranslateX = useRef(new Animated.Value(0)).current;

  // Pulse animation for scroll indicator
  const pulseAnim = useRef(new Animated.Value(0.3)).current;

  // Fade animation for card container
  const cardOpacity = useRef(new Animated.Value(1)).current;

  // Slide animation for exploration container (starts off-screen at bottom)
  const explorationTranslateY = useRef(new Animated.Value(height)).current;

  // Pan responder for swipe back and swipe down gestures
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        const touchX = evt.nativeEvent.pageX;
        const touchY = evt.nativeEvent.pageY;
        const startX = touchX - gestureState.dx;
        const startY = touchY - gestureState.dy;
        const fromLeftEdge = startX < 50;
        const fromTopEdge = startY < (safeAreaInsets.top + 100);
        const isRightSwipe = gestureState.dx > 5;
        const isDownSwipe = gestureState.dy < -5;
        const isUpSwipe = gestureState.dy > 5;
        const isHorizontal = Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
        const isVertical = Math.abs(gestureState.dy) > Math.abs(gestureState.dx);

        // Don't capture vertical swipes when keyboard is visible
        const shouldCaptureVertical = !isKeyboardVisible && ((isDownSwipe || (isUpSwipe && fromTopEdge)) && isVertical);
        const shouldCapture = (fromLeftEdge && isRightSwipe && isHorizontal) || shouldCaptureVertical;

        // Capture left-edge right swipe OR vertical swipes (only if keyboard is hidden)
        return shouldCapture;
      },
      onPanResponderGrant: () => {
        swipeTranslateX.setOffset(0);
        swipeTranslateX.setValue(0);
      },
      onPanResponderMove: (_, gestureState) => {
        const isHorizontal = Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
        const isVertical = Math.abs(gestureState.dy) > Math.abs(gestureState.dx);

        // Handle horizontal swipe for back gesture
        if (gestureState.dx > 0 && isHorizontal) {
          swipeTranslateX.setValue(gestureState.dx);
        }

        // Handle vertical swipe - track finger movement for exploration container
        if (isVertical && isExplorationVisibleRef.current) {
          // Only allow downward movement (positive dy) when exploration is visible
          if (gestureState.dy > 0) {
            explorationTranslateY.setValue(gestureState.dy);
            
          }
        } else if (isVertical && !isExplorationVisibleRef.current) {
          // Only allow upward movement (negative dy) when card is visible
          // But we want the exploration to rise, so we need to calculate from bottom
          if (gestureState.dy < 0) {
            const movement = Math.max(0, height + gestureState.dy);
            explorationTranslateY.setValue(movement);
          }
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        const screenWidth = Dimensions.get('window').width;
        const isVertical = Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
        const threshold = height * 0.2; // 30% of screen height
        console.log('Pan release:', { dy: gestureState.dy, isVertical, isExplorationVisible: isExplorationVisibleRef.current });

        if (isVertical && !isExplorationVisibleRef.current && gestureState.dy < 0)  {
             // Handle swipe down to show exploration
            if (gestureState.dy < -threshold) {
              setIsExplorationVisible(true);

              // Fade out card, slide up exploration from bottom
              Animated.parallel([
                Animated.timing(cardOpacity, {
                  toValue: 0,
                  duration: 200,
                  useNativeDriver: true,
                }),
                Animated.timing(explorationTranslateY, {
                  toValue: 0,
                  duration: 200,
                  useNativeDriver: true,
                }),
              ]).start();

              // Load content if needed
              if (artworkBites.length === 0) {
                fetchArtworkBite();
              } else {
                setIsTopicLoading(true);
                setTimeout(() => {
                  fetchSuggestedTopics();
                }, 500);
              }
            } else {
              console.log("spring back")
              // Spring back to bottom if didn't swipe far enough
              Animated.spring(explorationTranslateY, {
                toValue: height,
                useNativeDriver: true,
                ...animations.spring.stiff,
              }).start();
            }
            return;
        }
          
        if (isVertical && isExplorationVisibleRef.current && gestureState.dy > 0) { // isExplorationVisible
            console.log("isExplorationVisible, dy:", gestureState.dy, "threshold:", threshold)
            // Handle swipe up to return to card (or spring back if not enough)
            if (gestureState.dy > threshold) {
              setIsExplorationVisible(false); // Set state immediately
              // Swipe passed threshold - slide down exploration to bottom
              Animated.parallel([
                Animated.timing(cardOpacity, {
                  toValue: 1,
                  duration: 200,
                  useNativeDriver: true,
                }),
                Animated.timing(explorationTranslateY, {
                  toValue: height,
                  duration: 200,
                  useNativeDriver: true,
                }),
              ]).start();
            } else {
              // Didn't swipe far enough - spring back to position
              Animated.spring(explorationTranslateY, {
                toValue: 0,
                useNativeDriver: true,
                ...animations.spring.stiff,
              }).start();
            }
            return;
        }
        
        // Handle swipe right to go back
        if (gestureState.dx > screenWidth / 2) {
          Animated.timing(swipeTranslateX, {
            toValue: screenWidth,
            duration: animations.timing.fast,
            useNativeDriver: true,
          }).start(() => {
            onBack();
          });
        } else {
          Animated.spring(swipeTranslateX, {
            toValue: 0,
            useNativeDriver: true,
            ...animations.spring.stiff,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(swipeTranslateX, {
          toValue: 0,
          useNativeDriver: true,
          ...animations.spring.stiff,
        }).start();
      },
    })
  ).current;

  useEffect(() => {
    fetchArtworkDetails();
  }, [artworkId]);

  // Keep ref in sync with state for pan responder
  useEffect(() => {
    isExplorationVisibleRef.current = isExplorationVisible;
  }, [isExplorationVisible]);

  // Keyboard event listeners to track keyboard state
  useEffect(() => {
    const keyboardWillShowListener = Keyboard.addListener(
      'keyboardWillShow',
      () => {
        setIsKeyboardVisible(true);
      }
    );

    const keyboardWillHideListener = Keyboard.addListener(
      'keyboardWillHide',
      () => {
        setIsKeyboardVisible(false);
      }
    );

    return () => {
      keyboardWillShowListener.remove();
      keyboardWillHideListener.remove();
    };
  }, []);

  // Pulse animation for scroll indicator
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.3,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  // Handler for back button - returns to artwork card if in exploration view
  const handleBackPress = () => {
    if (isExplorationVisible) {
      // Return to artwork card view
      setIsExplorationVisible(false);
      Animated.parallel([
        Animated.timing(cardOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(explorationTranslateY, {
          toValue: height,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Navigate back to history page
      onBack();
    }
  };

  const fetchArtworkDetails = async () => {
    try {
      // Only show loading if we don't have initial photo
      if (!initialPhotoUri) {
        setIsLoading(true);
      }
      setHasError(false);

      const artworkData = await savedArtworkApiService.getSavedArtwork(artworkId);
      setArtwork(artworkData);
      setPhotoUri(artworkData.photo_uri);

      // Use cached background color immediately if available (and not already set from initial)
      if (artworkData.background_color && !initialBackgroundColor) {
        setBackgroundColor(artworkData.background_color);
      }

      // Load previous conversation history (including both user and assistant messages)
      if (artworkData.conversation_history && artworkData.conversation_history.length > 0) {
        const bites = artworkData.conversation_history.map(msg => ({
          content: msg.content,
          topic: undefined,
          role: msg.role as 'user' | 'assistant',
        }));
        setArtworkBites(bites);
      }

      // Extract dominant color only if we don't have a cached one
      if (!artworkData.background_color && !initialBackgroundColor) {
        extractDominantColor(artworkData.photo_uri, artworkData.id);
      }

      setHasError(false);
    } catch (error) {
      console.error('Error fetching artwork details:', error);
      setHasError(true);
      setErrorMessage('Failed to load artwork details. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const extractDominantColor = async (photoUri: string, artworkId: string) => {
    try {
      let imageUri = photoUri;

      // If it's a ph:// URI from iOS Photos library, convert it to a file path
      if (photoUri.startsWith('ph://')) {
        console.log('[SavedArtworkDetail] Converting ph:// URI to file path...');
        const RNFS = require('react-native-fs');

        try {
          // Create a temporary file path
          const tempPath = `${RNFS.CachesDirectoryPath}/temp_color_extract_${Date.now()}.jpg`;

          // Copy the asset from Photos library to cache directory
          await RNFS.copyAssetsFileIOS(photoUri, tempPath, 0, 0);

          // Use file:// prefix for the temporary path
          imageUri = `file://${tempPath}`;
          console.log('[SavedArtworkDetail] Converted to file path:', imageUri);
        } catch (conversionError) {
          console.warn('[SavedArtworkDetail] Failed to convert ph:// URI, using original:', conversionError);
          // Fall back to original URI
          imageUri = photoUri;
        }
      }

      const result = await getColors(imageUri, {
        fallback: colors.background,
        cache: true,
        key: photoUri, // Use original URI as cache key
      });

      let softenedColor = colors.background;
      if (result.platform === 'ios') {
        const extractedColor = result.background || colors.background;
        softenedColor = softenColor(extractedColor, colors.background);
        setBackgroundColor(softenedColor);
      } else if (result.platform === 'android') {
        const extractedColor = result.average || colors.background;
        softenedColor = softenColor(extractedColor, colors.background);
        setBackgroundColor(softenedColor);
      }

      // Save the extracted color to database for future use
      try {
        await savedArtworkApiService.updateBackgroundColor(artworkId, softenedColor);
        console.log('[SavedArtworkDetail] Background color saved to database:', softenedColor);
      } catch (saveError) {
        console.warn('[SavedArtworkDetail] Failed to save background color:', saveError);
        // Don't throw - color extraction was successful, just cache update failed
      }
    } catch (error) {
      console.error('Failed to extract color:', error);
      setBackgroundColor(colors.background);
    }
  };

  const fetchSuggestedTopics = async () => {
    if (!artwork) return;

    try {
      const topicUrl = `${API_BASE_URL}${API_ENDPOINTS.ANALYZE_TOPIC}?saved_artwork_id=${artworkId}&identity=gamified`;

      const response = await fetch(topicUrl, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }

      const data = await response.json();

      if (data.suggested_topics && Array.isArray(data.suggested_topics)) {
        setSuggestedTopics(data.suggested_topics);
      }
    } catch (error) {
      console.error('Error fetching suggested topics:', error);
    } finally {
      setIsTopicLoading(false);
    }
  };

  const fetchArtworkBite = async (topic?: string) => {
    if (!artwork) return;

    try {
      setIsBiteLoading(true);
      setSuggestedTopics([]);

      if (topic) {
        setCurrentSelectedTopic(topic);
      } else {
        setCurrentSelectedTopic(null);
      }

      // Compress image before uploading to avoid 413 errors (Vercel 4.5MB limit)
      console.log('[SavedArtworkDetail] Compressing image for API upload...');
      const compressed = await compressImage(artwork.photo_uri, getCompressionSettings());
      const uploadUri = compressed.uri;
      console.log(`[SavedArtworkDetail] Using ${compressed.size > 0 ? 'compressed' : 'original'} image for upload`);

      const formData = new FormData();
      formData.append('image', {
        uri: uploadUri,
        type: 'image/jpeg',
        name: 'artwork.jpg',
      } as any);
      formData.append('artist_name', artwork.artist_name);
      formData.append('artwork_name', artwork.artwork_name);
      formData.append('identity', 'gamified');
      formData.append('saved_artwork_id', artworkId);

      if (topic) {
        formData.append('topic', topic);
      }

      const biteUrl = `${API_BASE_URL}${API_ENDPOINTS.ANALYZE_BITE}`;
      const response = await fetch(biteUrl, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }

      const data = await response.json();

      // Add user message if topic was provided
      if (topic) {
        setArtworkBites(prev => [...prev, {
          content: topic,
          role: 'user' as const,
        }]);
      }

      // Add assistant response
      setArtworkBites(prev => {
        const newBite = {
          content: data.bite,
          topic: topic,
          role: 'assistant' as const,
        };
        return [...prev, newBite];
      });

      setCurrentSelectedTopic(null);

      // Fetch suggested topics after bite completes successfully
      // This ensures the topic generation has the latest conversation context
      setTimeout(() => {
        fetchSuggestedTopics();
      }, 500);
    } catch (error) {
      console.error('Error fetching artwork bite:', error);
      setArtworkBites(prev => [...prev, {
        content: 'Failed to load artwork information. Please try again.',
        role: 'assistant' as const,
      }]);
      setCurrentSelectedTopic(null);
    } finally {
      setIsBiteLoading(false);
    }
  };

  const handleRetry = () => {
    fetchArtworkDetails();
  };

  const handleToastHide = () => {
    setShowToast(false);
    onBack();
  };

  const handleDeletePress = () => {
    setShowMenu(false);
    Alert.alert(
      'Delete Artwork',
      'Are you sure you want to delete this artwork? This action cannot be undone.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await savedArtworkApiService.deleteSavedArtwork(artworkId);
              setShowToast(true);
            } catch (error) {
              console.error('Error deleting artwork:', error);
              Alert.alert('Error', 'Failed to delete artwork. Please try again.');
            }
          },
        },
      ]
    );
  };

  if (isLoading && !photoUri) {
    return (
      <View style={[styles.container, { paddingTop: safeAreaInsets.top }]}>
        <LoadingProgressBar message="Loading..." />
      </View>
    );
  }

  if (hasError || (!artwork && !photoUri)) {
    return (
      <View style={[styles.container, { paddingTop: safeAreaInsets.top }]}>
        <View style={styles.errorContainer}>
          <Typography variant="body" style={styles.errorText}>
            {errorMessage || 'Something went wrong'}
          </Typography>
          <ActionButton label="Retry" onPress={handleRetry} />
          <ActionButton label="Go Back" onPress={onBack} />
        </View>
      </View>
    );
  }

  return (
    <Animated.View
      style={[
        styles.container,
        {
          paddingTop: safeAreaInsets.top,
          transform: [{ translateX: swipeTranslateX }],
        },
      ]}
    >
      {/* Back Arrow */}
      <TouchableOpacity
        style={[styles.backButton, { top: safeAreaInsets.top + 16 }]}
        onPress={handleBackPress}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <ArrowIcon size={24} color={colors.darkGrey} direction="left" />
      </TouchableOpacity>

      {/* Three-dot Menu */}
      <TouchableOpacity
        style={[styles.menuButton, { top: safeAreaInsets.top + 16 }]}
        onPress={() => setShowMenu(!showMenu)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <MoreIcon size={24} color={colors.darkGrey} />
      </TouchableOpacity>

      {/* Dropdown Menu */}
      {showMenu && (
        <View style={[styles.dropdownMenu, { top: safeAreaInsets.top + 56 }]}>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={handleDeletePress}
          >
            <Typography style={styles.menuItemText}>Delete</Typography>
          </TouchableOpacity>
        </View>
      )}

      {/* Overlay to close menu when clicking outside */}
      {showMenu && (
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={() => setShowMenu(false)}
        />
      )}

      <View
        style={styles.backgroundContainer}>
        <Animated.View
          style={styles.swipeOverlay}
          {...panResponder.panHandlers}
        >
          <KeyboardAvoidingView
            style={styles.keyboardAvoidView}
            keyboardVerticalOffset={-100}
            behavior="position">
              <View style={[styles.contentWrapper, { paddingTop: safeAreaInsets.top }]}>
                {/* Artwork Image Card */}
                <Animated.View style={[styles.cardContainer, {backgroundColor: backgroundColor, opacity: cardOpacity}]}>
                  <ArtworkImageContainer
                    imageUri={photoUri}
                    withShadow={true}
                  />
                  {/* Artist Info Card - only show when artwork data is loaded */}
                  {artwork && (
                    <SavedArtistCard
                      artistName={artwork.artist_name}
                      title={artwork.artwork_name}
                      summary={artwork.summary || ''}
                      withShadow={true}
                      backgroundColor={backgroundColor}
                      onPress={() => {}}
                      onEdit={async (artistName, title, summary) => {
                        try {
                          const updatedArtwork = await savedArtworkApiService.updateSavedArtwork(
                            artworkId,
                            artistName,
                            title,
                            summary
                          );
                          setArtwork(updatedArtwork);
                        } catch (error) {
                          console.error('Error updating artwork:', error);
                          Alert.alert('Error', 'Failed to update artwork. Please try again.');
                        }
                      }}
                    />
                  )}
                </Animated.View>

                {/* Exploration Container - Full screen immersive */}
                <Animated.View
                  style={[styles.explorationContainer, {transform: [{translateY: explorationTranslateY}]}]}
                  pointerEvents={isExplorationVisible ? "box-none" : "none"}
                >
                  {/* Header */}
                  <View style={[styles.explorationHeader, { paddingTop: safeAreaInsets.top }]}>
                    <Heading2>Explore this piece</Heading2>
                  </View>

                  {/* Scrollable content */}
                  <ScrollView
                    style={styles.explorationScroll}
                    contentContainerStyle={styles.explorationScrollContent}
                    showsVerticalScrollIndicator={true}
                    bounces={true}
                  >
                    {/* Artwork Bites */}
                    {artworkBites.length > 0 && (
                      <View style={styles.bitesContainer}>
                        {artworkBites.map((bite, index) => (
                          <View key={index} style={styles.biteWithTopicContainer}>
                            {/* Show user messages as topic buttons */}
                            {bite.role === 'user' ? (
                              <View style={styles.selectedTopicContainer}>
                                <TopicChip
                                  label={bite.content}
                                  onPress={() => {}}
                                  disabled={true}
                                />
                              </View>
                            ) : (
                              /* Show assistant messages as bite cards */
                              <ArtworkBite content={bite.content} />
                            )}
                          </View>
                        ))}
                        {currentSelectedTopic && isBiteLoading && (
                          <View style={styles.selectedTopicContainer}>
                            <TopicChip
                              label={currentSelectedTopic}
                              onPress={() => {}}
                              disabled={true}
                            />
                          </View>
                        )}
                      </View>
                    )}

                    {/* Loading indicator for new bite */}
                    {isBiteLoading && (
                      <View style={styles.biteLoadingContainer}>
                        <LoadingProgressBar message="Conjuring..." />
                      </View>
                    )}
                    {isTopicLoading && (
                      <View style={styles.biteLoadingContainer}>
                        <LoadingProgressBar />
                      </View>
                    )}

                    {/* Topic buttons for follow-up questions */}
                    {suggestedTopics.length > 0 && (
                      <View style={styles.topicButtonsContainer}>
                        {suggestedTopics.map((topic, index) => (
                          <TopicChip
                            key={index}
                            label={topic}
                            onPress={() => fetchArtworkBite(topic)}
                          />
                        ))}
                      </View>
                    )}
                  </ScrollView>

                  {/* Bottom action buttons */}
                  <View style={styles.explorationFooter}>
                    <ActionButton
                      label="Tell me more"
                      onPress={() => fetchArtworkBite()}
                    />
                  </View>
                </Animated.View>

              </View>

              {/* Swipe indicator */}
              {!isExplorationVisible &&  <View style={styles.scrollIndicatorContainer} pointerEvents="none">
                <Animated.View style={{ opacity: pulseAnim, alignItems:'center', gap: spacing.xs }}>
                  <ArrowIcon
                    size={24}
                    color={colors.darkGrey}
                    direction={"down"}
                  />
                  <Typography style={styles.scrollIndicatorText}>
                    {"Swipe down to explore"}
                  </Typography>
                </Animated.View>
              </View>}
          </KeyboardAvoidingView>
        </Animated.View>
      </View>

      {/* Success Toast */}
      <Toast
        message="Deleted successfully"
        visible={showToast}
        duration={1000}
        onHide={handleToastHide}
        topOffset={safeAreaInsets.top + 80}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
    alignItems: 'center',
  },
  backgroundContainer: {
    position: 'absolute',
    width: width,
    height: height,
    alignItems: 'center',
  },
  swipeOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  keyboardAvoidView: {
    flex: 1,
    overflow: 'visible',
  },
  scrollContent: {
    flex: 1,
    alignItems: 'center',
    overflow: 'visible',
  },
  contentWrapper: {
    height: "100%",
    // alignSelf: 'center',
    alignItems: 'center',
  },
  cardContainer: {
    width: '92%',
    height: '85%',
    borderRadius: borderRadius.lg,
    paddingVertical: spacing['3xl'],
    paddingHorizontal: spacing['xl'],
    gap: spacing.xl,
    alignItems: 'stretch',
    justifyContent: 'space-around',
    ...shadows.lg,
  },
  errorContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.lg,
    paddingVertical: spacing['2xl'],
  },
  errorText: {
    color: colors.darkGrey,
    textAlign: 'center',
    marginBottom: spacing.base,
    fontFamily: 'PP Neue Montreal',
  },
  scrollIndicatorContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  scrollIndicatorText: {
    fontFamily: 'PP Neue Montreal',
    fontSize: 14,
    fontWeight: '600',
    color: colors.darkGrey,
  },
  bitesContainer: {
    marginTop: spacing['xl'],
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.base,
  },
  biteWithTopicContainer: {
    width: '100%',
    alignItems: 'center',
    gap: spacing.sm,
  },
  biteLoadingContainer: {
    marginTop: spacing.lg,
    width: '100%',
    alignItems: 'center',
    alignSelf: 'center',
  },
  topicButtonsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.base,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  selectedTopicContainer: {
    width: '100%',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    marginBottom: spacing.lg,
  },
  explorationContainer: {
    position: 'absolute',
    height: height,
    width: '100%',
    backgroundColor: colors.background,
    borderRadius: borderRadius.xl,
    paddingTop: spacing['2xl'],
  },
  explorationHeader: {
    paddingHorizontal: spacing['xl'],
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  explorationScroll: {
    flex: 1,
  },
  explorationScrollContent: {
    paddingHorizontal: spacing['2xl'],
    paddingVertical: spacing.lg,
    gap: spacing.base,
  },
  explorationFooter: {
    paddingHorizontal: spacing['2xl'],
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  backButton: {
    position: 'absolute',
    left: spacing.lg,
    zIndex: 1000,
    padding: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    ...shadows.md,
  },
  menuButton: {
    position: 'absolute',
    right: spacing.lg,
    zIndex: 1000,
    padding: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    ...shadows.md,
  },
  menuOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
  },
  dropdownMenu: {
    position: 'absolute',
    right: spacing.lg,
    zIndex: 1001,
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    minWidth: 120,
    ...shadows.lg,
    overflow: 'hidden',
  },
  menuItem: {
    paddingVertical: spacing.base,
    paddingHorizontal: spacing.lg,
  },
  menuItemText: {
    fontFamily: 'PP Neue Montreal',
    fontSize: 14,
    color: colors.darkGrey,
  },
  menuDivider: {
    height: 1,
    backgroundColor: colors.midGrey,
  },
});
