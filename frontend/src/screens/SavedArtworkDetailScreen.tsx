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
  Modal,
  Image,
  StatusBar,
  ImageBackground,
} from 'react-native';
import { BlurView } from '@react-native-community/blur';
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
import { savedArtworkApiService, SavedArtwork, ColorPalette } from '../services/savedArtworkApi';
import { artworkCacheService } from '../services/artworkCache';
import { getColors } from 'react-native-image-colors';
import { softenColor, darkenColor, getContrastColorBW } from '../utils/colorUtils';
import { compressImage, getCompressionSettings } from '../utils/imageUtils';

interface SavedArtworkDetailScreenProps {
  artworkId: string;
  onBack: () => void;
  initialPhotoUri?: string;
  initialBackgroundColor?: string;
  artworkIds?: string[]; // List of all artwork IDs in the gallery
  currentIndex?: number; // Current artwork index in the list
  onNavigateToArtwork?: (artworkId: string) => void; // Callback to navigate to another artwork
  useBlurBackground?: boolean; // Toggle between solid color or blurred image background for exploration container
  isFromGallery?: boolean; // Whether this screen was opened from gallery (to keep gallery in background)
}

const { width, height } = Dimensions.get('window');

export default function SavedArtworkDetailScreen({
  artworkId,
  onBack,
  initialPhotoUri,
  initialBackgroundColor,
  artworkIds = [],
  currentIndex = 0,
  onNavigateToArtwork,
  useBlurBackground = true,
  isFromGallery = false,
}: SavedArtworkDetailScreenProps) {
  console.log('[SavedArtworkDetail] Component rendered with artworkId:', artworkId);
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

  // Track current artwork ID and IDs list for pan responder
  const artworkIdRef = useRef(artworkId);
  const artworkIdsRef = useRef(artworkIds);

  // Track keyboard state
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  // Full-screen image state
  const [isFullScreenImage, setIsFullScreenImage] = useState(false);

  // Background color state - use initial color if provided
  const [backgroundColor, setBackgroundColor] = useState(initialBackgroundColor || colors.background);

  // Photo URI state - use initial photo if provided
  const [photoUri, setPhotoUri] = useState(initialPhotoUri || '');

  // Store previous artwork data for smooth transition
  const [previousArtwork, setPreviousArtwork] = useState<{
    photoUri: string;
    backgroundColor: string;
  } | null>(null);

  // Swipe gesture
  const swipeTranslateX = useRef(new Animated.Value(0)).current;

  // Pulse animation for scroll indicator and aurora glow
  const pulseAnim = useRef(new Animated.Value(0.3)).current;

  // Fade animation for card container
  const cardOpacity = useRef(new Animated.Value(1)).current;

  // Slide animation for exploration container (starts off-screen at bottom)
  const explorationTranslateY = useRef(new Animated.Value(height-100)).current;

  // Slide-in animation for entire screen (starts off-screen to the right)
  const screenSlideX = useRef(new Animated.Value(width)).current;

  // Combined translateX for both swipe and slide animations
  const combinedTranslateX = Animated.add(swipeTranslateX, screenSlideX);

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
        const fromCenterArea = startY > height * 0.2 && startY < height * 0.8 && startX > width * 0.1 && startX < width * 0.9;
        const isRightSwipe = gestureState.dx > 5;
        const isLeftSwipe = gestureState.dx < -5;
        const isDownSwipe = gestureState.dy < -5;
        const isUpSwipe = gestureState.dy > 5;
        const isHorizontal = Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
        const isVertical = Math.abs(gestureState.dy) > Math.abs(gestureState.dx);

        // Don't capture vertical swipes when keyboard is visible
        const shouldCaptureVertical = !isKeyboardVisible && ((isDownSwipe || (isUpSwipe && fromTopEdge)) && isVertical);
        const shouldCaptureBackSwipe = fromLeftEdge && isRightSwipe && isHorizontal;
        const shouldCaptureNavSwipe = fromCenterArea && (isRightSwipe || isLeftSwipe) && isHorizontal && !isExplorationVisibleRef.current;

        if (shouldCaptureNavSwipe) {
          console.log('[NavSwipe] Capturing nav swipe:', { startX, startY, dx: gestureState.dx, fromCenterArea, artworkIdsLength: artworkIds.length, currentIndex });
        }

        // Capture left-edge right swipe OR vertical swipes (only if keyboard is hidden) OR center horizontal swipes
        return shouldCaptureBackSwipe || shouldCaptureVertical || shouldCaptureNavSwipe;
      },
      onPanResponderGrant: () => {
        swipeTranslateX.setOffset(0);
        swipeTranslateX.setValue(0);
      },
      onPanResponderMove: (evt, gestureState) => {
        const isHorizontal = Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
        const isVertical = Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
        const startX = evt.nativeEvent.pageX - gestureState.dx;
        const startY = evt.nativeEvent.pageY - gestureState.dy;
        const fromLeftEdge = startX < 50;
        const fromCenterArea = startY > height * 0.2 && startY < height * 0.8 && startX > width * 0.1 && startX < width * 0.9;

        // Handle horizontal swipe for back gesture
        if (gestureState.dx > 0 && isHorizontal && fromLeftEdge) {
          swipeTranslateX.setValue(gestureState.dx);
        }

        // Handle horizontal swipe for navigation (center area)
        if (isHorizontal && fromCenterArea && !isExplorationVisibleRef.current) {
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
            const movement = Math.min(Math.max(0, height + gestureState.dy), height-100);
            explorationTranslateY.setValue(movement);
          }
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        const screenWidth = Dimensions.get('window').width;
        const isVertical = Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
        const isHorizontal = Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
        const threshold = height * 0.2; // 30% of screen height
        console.log('Pan release:', { dx: gestureState.dx, dy: gestureState.dy, isVertical, isHorizontal, isExplorationVisible: isExplorationVisibleRef.current });

        // Only handle vertical swipes if they have significant vertical movement and are clearly vertical
        if (isVertical && Math.abs(gestureState.dy) > 50 && !isExplorationVisibleRef.current && gestureState.dy < 0)  {
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

              // Always fetch new topics when opening exploration
              console.log('[Exploration] Opening exploration panel');
              console.log('[Exploration] Artwork loaded?', !!artwork);
              console.log('[Exploration] Existing bites:', artworkBites.length);

              // Note: First bite fetching is handled by useEffect that watches
              // for isExplorationVisible && artwork to both be true
              // Topics are also fetched by the same useEffect once artwork is ready
            } else {
              console.log("spring back")
              // Spring back to bottom if didn't swipe far enough
              Animated.spring(explorationTranslateY, {
                toValue: height-100,
                useNativeDriver: true,
                ...animations.spring.stiff,
              }).start();
            }
            return;
        }
          
        if (isVertical && Math.abs(gestureState.dy) > 50 && isExplorationVisibleRef.current && gestureState.dy > 0) { // isExplorationVisible
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
                  toValue: height-100,
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
        
        // Handle horizontal swipes (back navigation or artwork navigation)
        const swipeThreshold = screenWidth / 3;

        // Check if this is a navigation swipe (center area, not from left edge)
        const touchX = gestureState.x0;
        const touchY = gestureState.y0;
        const fromCenterArea = touchY > height * 0.2 && touchY < height * 0.8 && touchX > width * 0.1 && touchX < width * 0.9;

        // Use refs to get current values (not closure values)
        const currentArtworkId = artworkIdRef.current;
        const currentArtworkIds = artworkIdsRef.current;
        const actualCurrentIndex = currentArtworkIds.indexOf(currentArtworkId);

        console.log('[NavSwipe] Release:', {
          fromCenterArea,
          dx: gestureState.dx,
          swipeThreshold,
          passedThreshold: Math.abs(gestureState.dx) > swipeThreshold,
          hasCallback: !!onNavigateToArtwork,
          artworkIdsLength: currentArtworkIds.length,
          currentArtworkId,
          actualCurrentIndex,
          touchX,
          touchY,
          heightRange: [height * 0.2, height * 0.8],
          widthRange: [width * 0.1, width * 0.9]
        });

        if (fromCenterArea && Math.abs(gestureState.dx) > swipeThreshold && onNavigateToArtwork && currentArtworkIds.length > 0) {
          console.log('[NavSwipe] Navigation triggered!', {
            dx: gestureState.dx,
            currentArtworkId,
            actualCurrentIndex,
            artworkIdsLength: currentArtworkIds.length
          });

          // Navigation swipe - go to prev/next artwork
          if (gestureState.dx > 0 && actualCurrentIndex > 0) {
            // Swipe right - go to previous artwork
            const prevArtworkId = currentArtworkIds[actualCurrentIndex - 1];
            console.log('[NavSwipe] Going to PREVIOUS artwork:', prevArtworkId, 'index:', actualCurrentIndex - 1);
            onNavigateToArtwork(prevArtworkId);
          } else if (gestureState.dx < 0 && actualCurrentIndex < currentArtworkIds.length - 1) {
            // Swipe left - go to next artwork
            const nextArtworkId = currentArtworkIds[actualCurrentIndex + 1];
            console.log('[NavSwipe] Going to NEXT artwork:', nextArtworkId, 'index:', actualCurrentIndex + 1);
            onNavigateToArtwork(nextArtworkId);
          } else {
            console.log('[NavSwipe] At boundary - cannot navigate further. Index:', actualCurrentIndex, 'of', currentArtworkIds.length - 1);
          }
          // Reset swipe position
          Animated.spring(swipeTranslateX, {
            toValue: 0,
            useNativeDriver: true,
            ...animations.spring.stiff,
          }).start();
        } 
        // else if (gestureState.dx > screenWidth / 2) {
        //   // Back swipe from left edge
        //   Animated.timing(swipeTranslateX, {
        //     toValue: screenWidth,
        //     duration: animations.timing.fast,
        //     useNativeDriver: true,
        //   }).start(() => {
        //     onBack();
        //   });
        // } 
        else {
          // Reset swipe position
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
    // Save current artwork as previous before fetching new one
    if (photoUri && backgroundColor) {
      setPreviousArtwork({
        photoUri,
        backgroundColor,
      });
    }

    fetchArtworkDetails();

    // Trigger slide-in animation when artwork changes
    screenSlideX.setValue(width);
    Animated.spring(screenSlideX, {
      toValue: 0,
      useNativeDriver: true,
      tension: 65,
      friction: 10,
    }).start(() => {
      // Clear previous artwork after animation completes
      setPreviousArtwork(null);
    });
  }, [artworkId]);

  // Keep refs in sync with props/state for pan responder
  useEffect(() => {
    isExplorationVisibleRef.current = isExplorationVisible;
  }, [isExplorationVisible]);

  useEffect(() => {
    artworkIdRef.current = artworkId;
    console.log('[SavedArtworkDetail] artworkIdRef updated to:', artworkId);
  }, [artworkId]);

  useEffect(() => {
    artworkIdsRef.current = artworkIds;
    console.log('[SavedArtworkDetail] artworkIdsRef updated, length:', artworkIds.length);
  }, [artworkIds]);

  // Auto-fetch first bite or topics when exploration opens and artwork is loaded
  useEffect(() => {
    console.log('[Exploration] useEffect triggered:', {
      isExplorationVisible,
      hasArtwork: !!artwork,
      bitesCount: artworkBites.length
    });

    if (isExplorationVisible && artwork) {
      if (artworkBites.length === 0) {
        // No conversation history - fetch first bite
        console.log('[Exploration] useEffect: No bites yet, fetching first bite');
        fetchArtworkBite();
      } else {
        // Has conversation history - fetch suggested topics
        console.log('[Exploration] useEffect: Has', artworkBites.length, 'bites, fetching topics');
        setIsTopicLoading(true);
        setTimeout(() => {
          fetchSuggestedTopics();
        }, 300);
      }
    } else {
      console.log('[Exploration] useEffect: Not ready because:', {
        exploration: isExplorationVisible ? 'visible' : 'hidden',
        artwork: artwork ? 'loaded' : 'NOT LOADED'
      });
    }
  }, [isExplorationVisible, artwork]);

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
          toValue: 0.8,
          duration: 2500,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.3,
          duration: 2500,
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
          toValue: height-100,
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
    console.log('[FetchArtwork] Starting to fetch artwork details for ID:', artworkId);
    try {
      // Only show loading if we don't have initial photo
      if (!initialPhotoUri) {
        setIsLoading(true);
      }
      setHasError(false);

      // Try to get from cache first, then fetch if not available
      console.log('[FetchArtwork] Checking cache...');
      const artworkData = await artworkCacheService.getOrFetch(
        artworkId,
        () => savedArtworkApiService.getSavedArtwork(artworkId)
      );

      console.log('[FetchArtwork] Got artwork:', {
        id: artworkData.id,
        artist_name: artworkData.artist_name,
        artwork_name: artworkData.artwork_name,
        fromCache: artworkCacheService.has(artworkId)
      });
      setArtwork(artworkData);
      console.log('[FetchArtwork] Artwork state updated');
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

      // Check if color_palette exists, if not compute it
      if (!artworkData.color_palette) {
        console.log('[SavedArtworkDetail] No color palette found, extracting...');
        extractDominantColor(artworkData);
      } else if (!artworkData.background_color && !initialBackgroundColor) {
        // If we have color palette but no background color, extract it anyway
        extractDominantColor(artworkData);
      }

      setHasError(false);

      // Pre-fetch nearby artworks for smooth navigation
      if (artworkIds.length > 0) {
        const currentIndex = artworkIds.indexOf(artworkId);
        if (currentIndex !== -1) {
          const nearbyIds: string[] = [];

          // Pre-fetch prev and next artworks
          if (currentIndex > 0) {
            nearbyIds.push(artworkIds[currentIndex - 1]);
          }
          if (currentIndex < artworkIds.length - 1) {
            nearbyIds.push(artworkIds[currentIndex + 1]);
          }

          if (nearbyIds.length > 0) {
            console.log('[FetchArtwork] Pre-fetching', nearbyIds.length, 'nearby artworks');
            artworkCacheService.prefetch(nearbyIds, (id) => savedArtworkApiService.getSavedArtwork(id));
          }
        }
      }
    } catch (error) {
      console.error('Error fetching artwork details:', error);
      setHasError(true);
      setErrorMessage('Failed to load artwork details. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const extractDominantColor = async (artwork: SavedArtwork) => {
    try {
      let imageUri = artwork.photo_uri;

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
      let colorPalette: ColorPalette | undefined;

      if (result.platform === 'ios') {
        // Extract all 4 color dimensions
        colorPalette = {
          background: result.background || colors.background,
          detail: result.detail || colors.background,
          primary: result.primary || colors.background,
          secondary: result.secondary || colors.background,
        };
        console.log('[SavedArtworkDetail] Color palette extracted:', colorPalette);
      } else if (result.platform === 'android') {
        // TODO
      }

      // Save both the background color and color palette to database
      try {
        if (colorPalette) {
          console.log('[SavedArtworkDetail] Attempting to save color palette...', { artworkId, colorPalette });

          // Update with color palette
          const updatedArtwork = await savedArtworkApiService.updateSavedArtwork(
            artworkId,
            artwork.artist_name,
            artwork.artwork_name,
            artwork.summary,
            colorPalette
          );
          console.log('[SavedArtworkDetail] Color palette saved to database successfully:', updatedArtwork.color_palette);

          // Update local artwork state
          setArtwork(updatedArtwork);

          // Update cache with new data
          artworkCacheService.set(artworkId, updatedArtwork);
        } else {
          // Fallback to just updating background color
          await savedArtworkApiService.updateBackgroundColor(artworkId, softenedColor);
          console.log('[SavedArtworkDetail] Background color saved to database:', softenedColor);
        }
      } catch (saveError) {
        console.error('[SavedArtworkDetail] Failed to save colors:', saveError);
        // Don't throw - color extraction was successful, just cache update failed
      }
    } catch (error) {
      console.error('Failed to extract color:', error);
      setBackgroundColor(colors.background);
    }
  };

  const fetchSuggestedTopics = async () => {
    console.log('[Topics] fetchSuggestedTopics called, artwork:', !!artwork);
    if (!artwork) {
      console.log('[Topics] No artwork, stopping loading and returning');
      setIsTopicLoading(false);
      return;
    }

    try {
      const topicUrl = `${API_BASE_URL}${API_ENDPOINTS.ANALYZE_TOPIC}?saved_artwork_id=${artworkId}&identity=gamified`;
      console.log('[Topics] Fetching topics from:', topicUrl);

      const response = await fetch(topicUrl, {
        method: 'GET',
      });

      console.log('[Topics] Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Topics] API error:', errorText);
        throw new Error(`API request failed with status ${response.status}`);
      }

      const data = await response.json();
      console.log('[Topics] Received topics:', data.suggested_topics);

      if (data.suggested_topics && Array.isArray(data.suggested_topics)) {
        setSuggestedTopics(data.suggested_topics);
        console.log('[Topics] Set', data.suggested_topics.length, 'topics');
      }
    } catch (error) {
      console.error('[Topics] Error fetching suggested topics:', error);
    } finally {
      console.log('[Topics] Setting isTopicLoading to false');
      setIsTopicLoading(false);
    }
  };

  const fetchArtworkBite = async (topic?: string) => {
    console.log('[ArtworkBite] fetchArtworkBite called with topic:', topic);
    if (!artwork) {
      console.log('[ArtworkBite] ERROR: No artwork found, returning early');
      return;
    }

    try {
      console.log('[ArtworkBite] Setting loading states...');
      setIsBiteLoading(true);
      setSuggestedTopics([]);

      if (topic) {
        setCurrentSelectedTopic(topic);
      } else {
        setCurrentSelectedTopic(null);
      }

      // Compress image before uploading to avoid 413 errors (Vercel 4.5MB limit)
      console.log('[ArtworkBite] Compressing image for API upload...');
      const compressed = await compressImage(artwork.photo_uri, getCompressionSettings());
      const uploadUri = compressed.uri;
      console.log(`[ArtworkBite] Using ${compressed.size > 0 ? 'compressed' : 'original'} image for upload`);

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
      console.log('[ArtworkBite] Making API call to:', biteUrl);
      console.log('[ArtworkBite] FormData fields:', {
        artist_name: artwork.artist_name,
        artwork_name: artwork.artwork_name,
        identity: 'gamified',
        saved_artwork_id: artworkId,
        topic: topic || 'none'
      });

      const response = await fetch(biteUrl, {
        method: 'POST',
        body: formData,
      });

      console.log('[ArtworkBite] Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[ArtworkBite] API error response:', errorText);
        throw new Error(`API request failed with status ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log('[ArtworkBite] API response received:', { bite: data.bite?.substring(0, 50) + '...' });

      // Add user message if topic was provided
      if (topic) {
        console.log('[ArtworkBite] Adding user message to bites:', topic);
        setArtworkBites(prev => {
          const updated = [...prev, {
            content: topic,
            role: 'user' as const,
          }];
          console.log('[ArtworkBite] Updated bites (user):', updated.length);
          return updated;
        });
      }

      // Add assistant response
      console.log('[ArtworkBite] Adding assistant response to bites');
      setArtworkBites(prev => {
        const newBite = {
          content: data.bite,
          topic: topic,
          role: 'assistant' as const,
        };
        const updated = [...prev, newBite];
        console.log('[ArtworkBite] Updated bites (assistant):', updated.length);
        console.log('[ArtworkBite] New bite content:', data.bite);
        return updated;
      });

      setCurrentSelectedTopic(null);

      // Fetch suggested topics after bite completes successfully
      // This ensures the topic generation has the latest conversation context
      console.log('[ArtworkBite] Fetching suggested topics...');
      setTimeout(() => {
        fetchSuggestedTopics();
      }, 500);
    } catch (error) {
      console.error('[ArtworkBite] Error fetching artwork bite:', error);
      setArtworkBites(prev => [...prev, {
        content: 'Failed to load artwork information. Please try again.',
        role: 'assistant' as const,
      }]);
      setCurrentSelectedTopic(null);
    } finally {
      console.log('[ArtworkBite] Setting isBiteLoading to false');
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
    <View style={isFromGallery ? styles.overlayContainer : styles.overlayContainer}>
      {/* Previous artwork (background during transition) - only show when NOT from gallery */}
      {/* {previousArtwork && !isFromGallery && (
        <View
          style={[
            styles.container,
            {
              paddingTop: safeAreaInsets.top,
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
            },
          ]}
        >
          <View style={[styles.backgroundContainer, { backgroundColor: previousArtwork.backgroundColor }]}>
            <View style={[styles.contentWrapper, { paddingTop: safeAreaInsets.top }]}>
              <View style={[styles.cardContainer, { backgroundColor: previousArtwork.backgroundColor }]}>
                <ArtworkImageContainer
                  imageUri={previousArtwork.photoUri}
                  withShadow={true}
                  onPress={() => {}}
                />
              </View>
            </View>
          </View>
        </View>
      )} */}

      {/* Current artwork (animated) */}
      <Animated.View
        style={[
          styles.container,
          {
            paddingTop: safeAreaInsets.top,
            transform: [{ translateX: combinedTranslateX }],
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
                    onPress={() => setIsFullScreenImage(true)}
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
                          // Update cache with new data
                          artworkCacheService.set(artworkId, updatedArtwork);
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
                  style={[styles.explorationContainerWrapper, {transform: [{translateY: explorationTranslateY}]}]}
                  pointerEvents={isExplorationVisible ? "box-none" : "none"}
                >
                  {/* Aurora Glow with pulsing animation */}
                  <Animated.View style={[styles.auroraGlow, { opacity: pulseAnim }]} />

                  {/* Main Container */}
                  {(() => {
                    // Calculate background color once
                    const headingColor = artwork?.color_palette?.primary
                    ? darkenColor(artwork.color_palette.primary) : darkenColor(backgroundColor);
                    const explorationBgColor = artwork?.color_palette?.primary
                      ? softenColor(artwork.color_palette.primary) : backgroundColor;
                    const textColor = useBlurBackground? colors.darkGrey : getContrastColorBW(explorationBgColor);

                    // Content to render inside the container
                    const containerContent = (
                      <>
                        {/* Header */}
                        <View style={[styles.explorationHeader, { paddingTop: isExplorationVisible? safeAreaInsets.top + 30 : safeAreaInsets.top }]}>
                          <Heading2 style={{ 
                            color: headingColor, 
                            shadowOpacity: 1, 
                            shadowColor: colors.black, 
                            shadowRadius: 20}}>Explore this piece</Heading2>
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
                                <ArtworkBite content={bite.content} textColor={textColor} />
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
                        <ActionButton
                          label="Shuffle topics"
                          onPress={() => {
                            console.log('[Topics] Shuffle button pressed');
                            setIsTopicLoading(true);
                            setSuggestedTopics([]);
                            setTimeout(() => {
                              fetchSuggestedTopics();
                            }, 100);
                          }}
                        />
                        <ActionButton
                          label="Done"
                          onPress={() => handleBackPress()}
                        />
                      </View>
                        </>
                    );

                    // Return the container with either blur or solid color background
                    return useBlurBackground ? (
                      <Animated.View style={[styles.explorationContainer, { backgroundColor: 'transparent', overflow: 'hidden' }]}>
                        <ImageBackground
                          source={{ uri: photoUri }}
                          style={styles.explorationBackgroundImage}
                          blurRadius={0}
                        >
                          <BlurView 
                            style={styles.blurOverlay}
                            blurType="thinMaterialLight"
                            blurAmount={200}>
                            {containerContent}
                          </BlurView>
                        </ImageBackground>
                      </Animated.View>
                    ) : (
                      <Animated.View style={[styles.explorationContainer, { backgroundColor: explorationBgColor }]}>
                        {containerContent}
                      </Animated.View>
                    );
                  })()}
                </Animated.View>

              </View>

              {/* Swipe indicator */}
              {!isExplorationVisible &&  <View style={styles.scrollIndicatorContainer} pointerEvents="none">
                <Animated.View style={{ opacity: pulseAnim, alignItems:'center', gap: spacing.xs }}>
                  <ArrowIcon
                    size={32}
                    color={colors.darkGrey}
                    direction={"down"}
                  />
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

      {/* Full-Screen Image Modal */}
      <Modal
        visible={isFullScreenImage}
        transparent={false}
        animationType="fade"
        onRequestClose={() => setIsFullScreenImage(false)}
      >
        <View style={styles.fullScreenContainer}>
          <StatusBar hidden />
          <Image
            source={{ uri: photoUri }}
            style={styles.fullScreenImage}
            resizeMode="contain"
          />
          {/* Close Button */}
          <TouchableOpacity
            style={[styles.fullScreenCloseButton, { top: safeAreaInsets.top + 10 }]}
            onPress={() => setIsFullScreenImage(false)}
            activeOpacity={0.7}
          >
            <View style={styles.closeButtonCircle}>
              <Typography style={styles.closeButtonText}>✕</Typography>
            </View>
          </TouchableOpacity>
        </View>
      </Modal>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
    alignItems: 'center',
  },
  overlayContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.white,
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
    bottom: 56,
    alignItems: 'center',
    justifyContent: 'flex-start',
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
  explorationContainerWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: height,
  },
  auroraGlow: {
    shadowColor: 'rgba(118, 165, 230, 0.8)', // Purple glow
    shadowOffset: { width: 0, height: 0 }, // Centered glow
    shadowOpacity: 1,
    shadowRadius: 30,
  },
  explorationContainer: {
    flex: 1,
    width: '100%',
    backgroundColor: colors.background,
    borderRadius: borderRadius['2xl'],
    ...shadows.lg,
  },
  explorationBackgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  blurOverlay: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  explorationHeader: {
    paddingHorizontal: spacing['xl'],
    paddingVertical: spacing.lg,
    alignItems: 'center',
    overflow:'visible'
  },
  explorationScroll: {
    flex: 1,
  },
  explorationScrollContent: {
    paddingVertical: spacing.lg,
    gap: spacing.base,
  },
  explorationFooter: {
    paddingHorizontal: spacing['2xl'],
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
    flexDirection: 'row',
    gap: spacing.lg
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
  fullScreenContainer: {
    flex: 1,
    backgroundColor: colors.black,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenImage: {
    width: '100%',
    height: '100%',
  },
  fullScreenCloseButton: {
    position: 'absolute',
    right: 20,
    zIndex: 1000,
  },
  closeButtonCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 24,
    color: colors.white,
    fontWeight: '300',
  },
});
