import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Animated,
  PanResponder,
  Easing,
  ScrollView,
  TextInput,
  Modal,
  Platform,
  Alert,
} from 'react-native';
import { BlurView } from '@react-native-community/blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';
import { API_BASE_URL, API_ENDPOINTS } from '../constants/api';
import { artistAnalysisCache } from '../utils/artistAnalysisCache';
import { Typography, Heading2, Body, Label, LoadingProgressBar, ArtistCard, ActionButton, TopicChip, ArtworkBite } from '../components';
import { spacing, shadows, borderRadius, animations } from '../constants/theme';
import { removeBackground } from 'react-native-background-remover';
import { getColors } from 'react-native-image-colors';
import { softenColor } from '../utils/colorUtils';
import { compressImage, getCompressionSettings } from '../utils/imageUtils';
import { savedArtworkApiService, ColorPalette } from '../services/savedArtworkApi';


interface ConversationData {
  artistName: string;
  artworkName: string;
  savedArtworkId: string | null;
  bites: Array<{ content: string; topic?: string; role?: 'user' | 'assistant' }>;
}

interface PhotoDisplayScreenProps {
  photoUri: string;
  onPhotoPress: () => void;
  onBack: () => void;
  onFinish?: (data: ConversationData) => void;
  identity?: string;
}

interface Artist {
  artist_name: string;
  artwork_name?: string;
  score: number;
  reason: string;
}

interface AnalysisResponse {
  analysis?: string;
}

const { width, height } = Dimensions.get('window');

export default function PhotoDisplayScreen({
  photoUri,
  onPhotoPress,
  onBack,
  onFinish,
  identity = 'gamified'
}: PhotoDisplayScreenProps) {
  const safeAreaInsets = useSafeAreaInsets();
  const [isFlipped, setIsFlipped] = useState(false);
  const flipAnimation = useRef(new Animated.Value(0)).current;
  const [artists, setArtists] = useState<Artist[]>([]);
  const [artworkAnalysis, setArtworkAnalysis] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [expandedArtistIndex, setExpandedArtistIndex] = useState<number | null>(null);
  const [selectedArtistIndex, setSelectedArtistIndex] = useState<number | null>(null);
  const [artworkBites, setArtworkBites] = useState<Array<{ content: string; topic?: string; role?: 'user' | 'assistant' }>>([]);
  const [isBiteLoading, setIsBiteLoading] = useState(false);
  const [isTopicLoading, setIsTopicLoading] = useState(false);

  const [savedArtworkId, setSavedArtworkId] = useState<string | null>(null);
  const [suggestedTopics, setSuggestedTopics] = useState<string[]>([]);
  const [currentSelectedTopic, setCurrentSelectedTopic] = useState<string | null>(null);
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualArtistName, setManualArtistName] = useState('');
  const [manualArtworkName, setManualArtworkName] = useState('');
  const [manualInputSubmitted, setManualInputSubmitted] = useState(false);
  const swipeTranslateX = useRef(new Animated.Value(0)).current;
  const cardSlideAnim = useRef(new Animated.Value(-height)).current; // Start from above screen

  // Background removal states
  const [photoUriNoBackground, setPhotoUriNoBackground] = useState<string | null>(null);
  const [isRemovingBackground, setIsRemovingBackground] = useState(false);
  const [showBackgroundRemoved, setShowBackgroundRemoved] = useState(false);

  // Exploration overlay state
  const [showExplorationOverlay, setShowExplorationOverlay] = useState(false);

  // Background color state
  const [backgroundColor, setBackgroundColor] = useState(colors.background);
  const [colorPalette, setColorPalette] = useState<ColorPalette | null>(null);

  // Pan responder for swipe gesture with smooth animation
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        // Calculate where the touch started
        const touchX = evt.nativeEvent.pageX;
        const startX = touchX - gestureState.dx;

        // Only activate if:
        // 1. Started from left edge (within 50px)
        // 2. Moving right (dx > 0)
        // 3. Moved at least 5px
        // 4. More horizontal than vertical
        const fromLeftEdge = startX < 50;
        const isRightSwipe = gestureState.dx > 5;
        const isHorizontal = Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
        console.log("onMoveShouldSetPanResponder - fromLeftEdge:", startX, "isRightSwipe:", isRightSwipe, "isHorizontal:", isHorizontal);
        return fromLeftEdge && isRightSwipe && isHorizontal;
      },

      onPanResponderGrant: () => {
        swipeTranslateX.setOffset(0);
        swipeTranslateX.setValue(0);
      },
      onPanResponderMove: (_, gestureState) => {
        // Only allow rightward movement (positive dx)
        if (gestureState.dx > 0) {
          swipeTranslateX.setValue(gestureState.dx);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        const screenWidth = Dimensions.get('window').width;
        const threshold = screenWidth / 2;

        // If swiped past center of screen, navigate back
        if (gestureState.dx > threshold) {
          // Animate to right edge and navigate
          Animated.timing(swipeTranslateX, {
            toValue: screenWidth,
            duration: animations.timing.fast,
            useNativeDriver: true,
          }).start(() => {
            onBack();
          });
        } else {
          // Snap back to original position
          Animated.spring(swipeTranslateX, {
            toValue: 0,
            useNativeDriver: true,
            ...animations.spring.stiff,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        // If gesture is interrupted, snap back
        Animated.spring(swipeTranslateX, {
          toValue: 0,
          useNativeDriver: true,
          ...animations.spring.stiff,
        }).start();
      },
    })
  ).current;


  useEffect(() => {
    extractDominantColor();
    // setIsLoading(true);
    // Animate card sliding down like Instax camera, then stay in center
    Animated.timing(cardSlideAnim, {
      toValue: 0,
      duration: animations.timing.slow,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    fetchArtistIdentification();
    // handleRemoveBackground();

    // Cleanup cache when component unmounts
    return () => {
      artistAnalysisCache.clear(photoUri);
    };
  }, []);


  const fetchArtistIdentification = async () => {
    try {
      setIsLoading(true);
      setHasError(false);
      setErrorMessage('');

      // Check if we already have a cached request or data
      const cached = artistAnalysisCache.get(photoUri);

      let data;
      if (cached?.data) {
        // Data already available from cache
        console.log('Using cached artist analysis data');
        data = cached.data;
      } else if (cached?.promise) {
        // Request already in progress, wait for it
        console.log('Waiting for in-progress artist analysis...');
        data = await cached.promise;
      } else {
        // No cache, make new request
        console.log('Making new artist analysis request');
        const formData = new FormData();
        formData.append('image', {
          uri: photoUri,
          type: 'image/jpeg',
          name: 'artwork.jpg',
        } as any);
        formData.append('identity', identity);
        const analyze_url = `${API_BASE_URL}${API_ENDPOINTS.ANALYZE_ARTIST}`
        const response = await fetch(analyze_url, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`API request failed with status ${response.status}`);
        }

        data = await response.json();
      }

      // Parse the analysis field which should contain JSON
      let artistsData: Artist[];
      let analysisContent: string = '';
      try {
        let analysisText = data.analysis;

        // If it's a string, strip markdown code block wrappers
        if (typeof analysisText === 'string') {
          // Remove ```json ... ``` or ``` ... ``` wrappers
          analysisText = analysisText.trim();
          const codeBlockRegex = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/;
          const match = analysisText.match(codeBlockRegex);
          if (match) {
            analysisText = match[1].trim();
          }

          // Now parse the cleaned string
          artistsData = JSON.parse(analysisText);
        } else {
          // Already an object/array
          artistsData = analysisText;
        }

        console.log("Parsed artists data:", artistsData);

        if (!Array.isArray(artistsData) || artistsData.length === 0) {
          throw new Error('No artists found in response');
        }

        // Check if the last item has an 'analysis' field instead of artist data
        const lastItem = artistsData[artistsData.length - 1];
        if (lastItem && 'analysis' in lastItem && !('artist_name' in lastItem)) {
          // Extract the analysis content
          analysisContent = (lastItem as AnalysisResponse).analysis || '';
          // Remove the analysis item from the artists array
          artistsData = artistsData.slice(0, -1);
          console.log("Extracted analysis content:", analysisContent);
        }

        if (artistsData.length === 0) {
          throw new Error('No artists found in response');
        }
      } catch (parseError) {
        console.error('=== PARSE ERROR ===');
        console.error('Error:', parseError);
        console.error('Raw data:', JSON.stringify(data.analysis));
        console.error('Full response:', JSON.stringify(data));
        throw new Error('Invalid artist data format');
      }

      setArtists(artistsData);
      setArtworkAnalysis(analysisContent);
      setHasError(false);
    } catch (error) {
      console.error('Error fetching artist identification:', error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to identify artists. Please try again.';
      setHasError(true);
      setErrorMessage(errorMsg);
      // Clear the cache so retry will make a fresh request
      artistAnalysisCache.clear(photoUri);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRetry = () => {
    fetchArtistIdentification();
  };

  const handleRemoveBackground = async () => {
    try {
      setIsRemovingBackground(true);
      console.log('=== STARTING BACKGROUND REMOVAL ===');
      console.log('Photo URI:', photoUri);
      console.log('Platform:', Platform.OS);

      // Use native library to remove background
      const backgroundRemovedImageURI = await removeBackground(photoUri);

      console.log('Background removed successfully');
      console.log('New URI:', backgroundRemovedImageURI);

      // Check if the URI actually changed (will be same on iOS simulator)
      if (backgroundRemovedImageURI === photoUri) {
        console.warn('[Background Removal] Running on iOS Simulator - background removal requires a real device');
        console.warn('[Background Removal] The library uses Vision framework which is only available on physical iOS devices');
        // Don't set the photoUriNoBackground since it's the same
      } else {
        setPhotoUriNoBackground(backgroundRemovedImageURI);
      }

    } catch (error) {
      console.error('Failed to remove background:', error);
      // Silently fail - background removal is optional
    } finally {
      setIsRemovingBackground(false);
    }
  };

  const extractDominantColor = async () => {
    try {
      console.log('=== EXTRACTING DOMINANT COLOR ===');
      console.log('Photo URI:', photoUri);

      let imageUri = photoUri;

      // If it's a ph:// URI from iOS Photos library, convert it to a file path
      if (photoUri.startsWith('ph://')) {
        console.log('[ColorExtraction] Converting ph:// URI to file path...');
        const RNFS = require('react-native-fs');

        try {
          // Create a temporary file path
          const tempPath = `${RNFS.CachesDirectoryPath}/temp_color_extract_${Date.now()}.jpg`;

          // Copy the asset from Photos library to cache directory
          await RNFS.copyAssetsFileIOS(photoUri, tempPath, 0, 0);

          // Use file:// prefix for the temporary path
          imageUri = `file://${tempPath}`;
          console.log('[ColorExtraction] Converted to file path:', imageUri);
        } catch (conversionError) {
          console.warn('[ColorExtraction] Failed to convert ph:// URI, using original:', conversionError);
          // Fall back to original URI
          imageUri = photoUri;
        }
      }

      const result = await getColors(imageUri, {
        fallback: colors.background,
        cache: true,
        key: photoUri, // Use original URI as cache key
      });

      console.log('Color extraction result:', result);

      if (result.platform === 'ios') {
        // Extract all 4 color dimensions from iOS result
        const colorPalette: ColorPalette = {
          background: result.background || colors.background,
          detail: result.detail || colors.background,
          primary: result.primary || colors.background,
          secondary: result.secondary || colors.background,
        };
        console.log('Color palette extracted:', colorPalette);
        setColorPalette(colorPalette);

        const extractedColor = result.background || colors.background;
        console.log('Extracted iOS color:', extractedColor);
        const softenedColor = softenColor(extractedColor, colors.background);
        console.log('Softened color:', softenedColor);
        setBackgroundColor(softenedColor);
      } else if (result.platform === 'android') {
        const extractedColor = result.average || colors.background;
        console.log('Extracted Android color:', extractedColor);
        const softenedColor = softenColor(extractedColor, colors.background);
        console.log('Softened color:', softenedColor);
        setBackgroundColor(softenedColor);
      }
    } catch (error) {
      console.error('Failed to extract color:', error);
      setBackgroundColor(colors.background);
    }
  };

  const flipCard = () => {
    Animated.timing(flipAnimation, {
      toValue: isFlipped ? 0 : 180,
      duration: animations.timing.slow,
      useNativeDriver: true,
    }).start();
    setIsFlipped(!isFlipped);
  };

  const handleCardPress = () => {
    flipCard();
  };

  const saveArtworkToDatabase = async (artist: Artist, colorPalette?: ColorPalette): Promise<string | null> => {
    try {
      console.log('[PhotoDisplay] Saving artwork to database...');

      // Check if artwork is recognized
      const artistLower = artist.artist_name.toLowerCase().trim();
      const artworkLower = (artist.artwork_name || 'untitled').toLowerCase().trim();

      const isRecognized =
        artistLower !== 'unknown' &&
        artistLower !== 'untitled' &&
        artistLower !== '' &&
        artworkLower !== 'unknown' &&
        artworkLower !== 'untitled' &&
        artworkLower !== '' &&
        !artistLower.includes('not an artwork') &&
        !artworkLower.includes('not an artwork');
      
      const result = await savedArtworkApiService.saveArtwork({
        photoUri,
        artistName: artist.artist_name,
        artworkName: artist.artwork_name || 'Unknown',
        conversationHistory: [], // Empty initially, will be populated as user explores
        isRecognized,
        colorPalette,
      });

      console.log('[PhotoDisplay] Artwork saved with ID:', result.id);
      setSavedArtworkId(result.id);
      return result.id;
    } catch (error) {
      console.error('[PhotoDisplay] Error saving artwork to database:', error);
      return null;
    }
  };

  const handleArtistPress = (index: number) => {
    // Toggle expanded state and select artist
    const isExpanding = expandedArtistIndex !== index;
    setExpandedArtistIndex(isExpanding ? index : null);
    setSelectedArtistIndex(isExpanding ? index : null);
  };

  // Check if the identified artist is unknown
  const isUnknownArtist = () => {
    if (artists.length === 0) return false;
    const firstArtist = artists[0].artist_name.toLowerCase();
    return firstArtist.includes('unknown') || firstArtist.includes('not an artwork');
  };

  const handleManualInputSubmit = () => {
    if (!manualArtistName.trim()) {
      // Could add error handling here
      return;
    }

    // Create a manual artist entry
    const manualArtist: Artist = {
      artist_name: manualArtistName.trim(),
      artwork_name: manualArtworkName.trim() || 'Unknown',
      score: 10, // User input is considered certain
      reason: 'Manually entered by user'
    };

    // Add manual artist to the list and select it
    setArtists([manualArtist]);
    setSelectedArtistIndex(0);
    setExpandedArtistIndex(0);
    setManualInputSubmitted(true);
    setShowManualInput(false);

    // Clear input fields
    setManualArtistName('');
    setManualArtworkName('');
  };

  const handleManualInputPress = () => {
    setShowManualInput(true);
  };

  const fetchSuggestedTopics = async (artworkId: string) => {
    try {
      const topicUrl = `${API_BASE_URL}${API_ENDPOINTS.ANALYZE_TOPIC}?saved_artwork_id=${artworkId}&identity=${encodeURIComponent(identity)}`;
      console.log('=== FETCHING SUGGESTED TOPICS ===');
      console.log('URL:', topicUrl);

      const response = await fetch(topicUrl, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }

      const data = await response.json();
      console.log('Topic suggestions response:', data);

      if (data.suggested_topics && Array.isArray(data.suggested_topics)) {
        setSuggestedTopics(data.suggested_topics);
      }
    } catch (error) {
      console.error('Error fetching suggested topics:', error);
      // Silently fail - topics are optional enhancement
    } finally {
      setIsTopicLoading(false);
    }
  };

  const fetchArtworkBite = async (topic?: string, artworkIdOverride?: string) => {
    if (selectedArtistIndex === null || !artists[selectedArtistIndex]) {
      console.error('No artist selected');
      return;
    }

    const selectedArtist = artists[selectedArtistIndex];

    try {
      setIsBiteLoading(true);
      setSuggestedTopics([]);
      // Set the currently selected topic immediately
      if (topic) {
        setCurrentSelectedTopic(topic);
      } else {
        setCurrentSelectedTopic(null);
      }

      // Compress image before uploading to avoid 413 errors (Vercel 4.5MB limit)
      console.log('[PhotoDisplay] Compressing image for API upload...');
      const compressed = await compressImage(photoUri, getCompressionSettings());
      const uploadUri = compressed.uri;
      console.log(`[PhotoDisplay] Using ${compressed.size > 0 ? 'compressed' : 'original'} image for upload`);

      const formData = new FormData();
      formData.append('image', {
        uri: uploadUri,
        type: 'image/jpeg',
        name: 'artwork.jpg',
      } as any);
      formData.append('artist_name', selectedArtist.artist_name);
      formData.append('artwork_name', selectedArtist.artwork_name || 'Unknown');
      formData.append('identity', identity);

      // Use artworkIdOverride if provided, otherwise use state
      // This fixes the issue where state hasn't updated yet after saving
      const artworkId = artworkIdOverride || savedArtworkId;

      // Include saved artwork ID if we have one
      if (artworkId) {
        formData.append('saved_artwork_id', artworkId);
      }

      // Include topic if provided
      if (topic) {
        formData.append('topic', topic);
      }

      const biteUrl = `${API_BASE_URL}${API_ENDPOINTS.ANALYZE_BITE}`;
      console.log('=== FETCHING ARTWORK BITE ===');
      console.log('URL:', biteUrl);
      console.log('Artist:', selectedArtist.artist_name);
      console.log('Artwork:', selectedArtist.artwork_name);
      console.log('Topic:', topic || 'none');
      console.log('Saved Artwork ID:', artworkId || 'not saved yet');
      console.log('Current bites count:', artworkBites.length);

      const response = await fetch(biteUrl, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }

      const data = await response.json();
      console.log('Bite response:', data);

      // Add user message if topic was provided
      if (topic) {
        setArtworkBites(prev => [...prev, {
          content: topic,
          role: 'user' as const,
        }]);
      }

      // Add new bite to the list with its topic
      setArtworkBites(prev => {
        const newBite = {
          content: data.bite,
          topic: topic, // Store which topic this bite is about
          role: 'assistant' as const,
        };
        return [...prev, newBite];
      });

      // Clear current selected topic since it's now saved with the bite
      setCurrentSelectedTopic(null);

      // Fetch suggested topics after bite completes successfully
      // This ensures the topic generation has the latest conversation context
      setTimeout(() => {
        fetchSuggestedTopics(artworkId);
      }, 500);
    } catch (error) {
      console.error('Error fetching artwork bite:', error);
      // Add error message as a bite
      setArtworkBites(prev => [...prev, {
        content: 'Failed to load artwork information. Please try again.',
        role: 'assistant' as const,
      }]);
      // Clear current selected topic on error too
      setCurrentSelectedTopic(null);
    } finally {
      setIsBiteLoading(false);

    }
  };

  const handleContinueOrMore = async () => {
    if (selectedArtistIndex === null) {
      Alert.alert(
        'Select Artist',
        'Please select an artist first by tapping on one of the cards.',
        [{ text: 'OK' }]
      );
      return;
    }

    // Save artwork to database when user confirms they want to explore
    let artworkId = savedArtworkId;
    if (!savedArtworkId) {
      artworkId = await saveArtworkToDatabase(artists[selectedArtistIndex], colorPalette || undefined);
    }

    // Open exploration overlay
    setShowExplorationOverlay(true);

    // Fetch first bite if not already loaded
    // Pass the artworkId directly to avoid state update delay
    if (artworkBites.length === 0) {
      fetchArtworkBite(undefined, artworkId || undefined);
    }
  };

  // Interpolate rotation values
  const frontInterpolate = flipAnimation.interpolate({
    inputRange: [0, 180],
    outputRange: ['0deg', '180deg'],
  });

  const backInterpolate = flipAnimation.interpolate({
    inputRange: [0, 180],
    outputRange: ['180deg', '360deg'],
  });

  const frontOpacity = flipAnimation.interpolate({
    inputRange: [0, 90, 90, 180],
    outputRange: [1, 1, 0, 0],
  });

  const backOpacity = flipAnimation.interpolate({
    inputRange: [0, 90, 90, 180],
    outputRange: [0, 0, 1, 1],
  });

  return (
    <Animated.View
      style={[
        styles.container,
        {
          paddingTop: safeAreaInsets.top,
          transform: [{ translateX: swipeTranslateX }],
          backgroundColor: backgroundColor,
        },
      ]}
    >
      {/* Background with elliptical shapes - matching Figma */}
      <View
        style={styles.backgroundContainer}
      >
        <Animated.View // overlay for swipable
          style = {styles.swipeOverlay}
          {...panResponder.panHandlers}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces={true}
          >
            <View style={styles.contentWrapper}>
              {/* Flippable Card Container */}
              <Animated.View
                style={[
                  styles.cardContainer,
                  {
                    transform: [
                      { translateY: cardSlideAnim },
                    ],
                  },
                ]}
              >
              {/* Front of Card - Image */}
              <TouchableOpacity
                activeOpacity={0.95}
                onPress={handleCardPress}
              >
                <Animated.View
                  style={[
                    styles.imageContainer,
                    {
                      transform: [{ rotateY: frontInterpolate }],
                      opacity: frontOpacity,
                    },
                  ]}
                >
                  <Image
                    source={{ uri: showBackgroundRemoved && photoUriNoBackground ? photoUriNoBackground : photoUri }}
                    style={styles.artworkImage}
                    resizeMode="cover"
                  />
                </Animated.View>
              </TouchableOpacity>

              {/* Back of Card - Time and Location */}
              <TouchableOpacity
                activeOpacity={1}
                style={styles.cardBack}
                onPress={handleCardPress}
              >
                <Animated.View
                  style={[
                    styles.imageContainer,
                    {
                      transform: [{ rotateY: backInterpolate }],
                      opacity: backOpacity,
                    },
                  ]}
                >
                  <View style={styles.metadataWrapper}>
                    <View style={styles.metadataItem}>
                      <Label>Time</Label>
                      <Typography variant="body">{new Date().toLocaleTimeString()}</Typography>
                    </View>
                    <View style={styles.metadataItem}>
                      <Label>Date</Label>
                      <Typography variant="body">{new Date().toLocaleDateString()}</Typography>
                    </View>
                    <View style={styles.metadataItem}>
                      <Label>Location</Label>
                      <Typography variant="body">San Francisco, CA</Typography>
                    </View>
                  </View>
                </Animated.View>
              </TouchableOpacity>
            </Animated.View>

            {/* Toggle Background Button */}
            {/* {photoUriNoBackground && !isFlipped && (
              <View style={styles.toggleBackgroundContainer}>
                <ActionButton
                  label={showBackgroundRemoved ? "Show Original" : "Remove Background"}
                  onPress={() => setShowBackgroundRemoved(!showBackgroundRemoved)}
                  theme="light"
                />
              </View>
            )} */}

            {/* Background removal loading indicator */}
            {/* {isRemovingBackground && (
              <View style={styles.backgroundLoadingContainer}>
                <LoadingProgressBar message="Processing..." />
              </View>
            )} */}

            {/* Artist List or Error or Artist Detail Below Card (always visible) */}
            <View style={styles.artistListBelow}>
              {isLoading ? (
                <>
                  <LoadingProgressBar message="Recognizing..." />
                </>
              ) : hasError ? (
                <>
                  <View style={styles.errorContainer}>
                    <Typography variant="body" style={styles.errorText}>
                      {errorMessage || 'Something went wrong'}
                    </Typography>
                    <ActionButton
                      label="Retry"
                      onPress={handleRetry}
                    />
                    <ActionButton
                      label="Go Back"
                      onPress={onBack}
                    />
                  </View>
                </>
              ) : (
                  <>
                    <View style={styles.artistListCentered}>
                      {artists.map((artist, index) => {
                        const isExpanded = (expandedArtistIndex === index) && artworkBites.length ===0;
                        return (
                          <ArtistCard
                            key={index}
                            artistName={artist.artist_name}
                            details={`${artist.artwork_name || 'Unknown'} (${artist.score * 10}%)`}
                            description={artist.reason}
                            isExpanded={isExpanded}
                            onPress={() => handleArtistPress(index)}
                          />
                        );
                      })}
                    </View>

                    {/* Display artwork analysis if available */}
                    {artworkAnalysis && (
                      <View style={styles.analysisContainer}>
                        <ArtworkBite content={artworkAnalysis} />
                      </View>
                    )}

                    {/* Show manual input button if artist is unknown */}
                    {isUnknownArtist() && !manualInputSubmitted && (
                      <View style={styles.manualInputPrompt}>
                        <ActionButton
                          label="Manual Input"
                          onPress={handleManualInputPress}
                        />
                      </View>
                    )}

                    {/* Action buttons */}
                    <View style={styles.actionButtonsContainer}>
                      <ActionButton
                        label="Explore now"
                        onPress={handleContinueOrMore}
                        disabled={selectedArtistIndex === null}
                      />
                      {onFinish && (
                        <ActionButton
                          label="Finish"
                          onPress={async () => {
                            const selectedArtist = artists[selectedArtistIndex || 0];

                            // Save artwork to database if not already saved
                            let artworkId = savedArtworkId;
                            if (!savedArtworkId) {
                              artworkId = await saveArtworkToDatabase(selectedArtist, colorPalette || undefined);
                            }

                            onFinish({
                              artistName: selectedArtist?.artist_name || 'Unknown',
                              artworkName: selectedArtist?.artwork_name || 'Untitled',
                              savedArtworkId: artworkId,
                              bites: artworkBites,
                            });
                          }}
                        />
                      )}
                    </View>
                  </>
                )}
            </View>
            </View>
          </ScrollView>
        </Animated.View>
      </View>

      {/* Manual Input Modal */}
      <Modal
        visible={showManualInput}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowManualInput(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Heading2 style={styles.modalTitle}>Enter Artwork Details</Heading2>

            <View style={styles.inputContainer}>
              <Label>Artist Name *</Label>
              <TextInput
                style={styles.input}
                placeholder=""
                placeholderTextColor={colors.darkGrey}
                value={manualArtistName}
                onChangeText={setManualArtistName}
                autoCapitalize="words"
              />
            </View>

            <View style={styles.inputContainer}>
              <Label>Artwork Name (Optional)</Label>
              <TextInput
                style={styles.input}
                placeholder=""
                placeholderTextColor={colors.darkGrey}
                value={manualArtworkName}
                onChangeText={setManualArtworkName}
                autoCapitalize="words"
              />
            </View>

            <View style={styles.modalButtons}>
              <ActionButton
                label="Cancel"
                onPress={() => setShowManualInput(false)}
              />
              <ActionButton
                label="Submit"
                onPress={handleManualInputSubmit}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Exploration Overlay Modal */}
      <Modal
        visible={showExplorationOverlay}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowExplorationOverlay(false)}
      >
        <View style={styles.explorationOverlay}>
          <BlurView
            style={styles.explorationContent}
            blurType="ultraThinMaterialLight"
            blurAmount={10}
            reducedTransparencyFallbackColor={colors.white}
          >
            {/* Header with close button */}
            <View style={styles.explorationHeader}>
              <Heading2>Explore this piece</Heading2>
              <TouchableOpacity onPress={() => setShowExplorationOverlay(false)}>
                <Typography style={styles.closeButton}>✕</Typography>
              </TouchableOpacity>
            </View>

            {/* Scrollable content area */}
            <ScrollView
              style={styles.explorationScroll}
              contentContainerStyle={styles.explorationScrollContent}
              showsVerticalScrollIndicator={true}
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
                        <>
                          {/* Show topic badge if this bite has a topic */}
                          {bite.topic && (
                            <View style={styles.selectedTopicContainer}>
                              <TopicChip
                                label={bite.topic}
                                onPress={() => {}}
                                disabled={true}
                              />
                            </View>
                          )}
                          <ArtworkBite content={bite.content} />
                        </>
                      )}
                    </View>
                  ))}
                  {/* Show currently selected topic while loading */}
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
                  <LoadingProgressBar/>
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
                label="Done"
                onPress={() => setShowExplorationOverlay(false)}
                theme="light"
              />
            </View>
          </BlurView>
        </View>
      </Modal>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
  },
  backgroundContainer: {
    position: 'absolute',
    width: width,
    height: height,
    overflow: 'hidden',
    alignItems: 'center',
  },
  swipeOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: spacing['4xl'], // Extra padding at bottom for scroll
  },
  contentWrapper: {
    alignItems: 'center',
  },
  imageContainer: {
    width: width - 80, // 40px padding on each side
    height: width - 80, // Square dimensions
    backgroundColor: '#FDFDFD',
    borderRadius: borderRadius.lg,
    ...shadows.lg,
    alignSelf: 'center',
    backfaceVisibility: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  artworkImage: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.white,
  },
  cardContainer: {
    marginTop: spacing['7xl'],
    width: width - 80,
    alignSelf: 'center',
    zIndex: 10000,
    elevation: 10000,
  },
  cardBack: {
    position: 'absolute',
    backfaceVisibility: 'hidden',
    alignItems: 'center',
    alignSelf: 'center',
  },
  artistListWrapper: {
    height: 440, // Same height as artworkImage
    justifyContent: 'center',
    alignItems: 'center',
  },
  artistListCentered: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.base,
    width: '100%',
  },
  analysisContainer: {
    marginTop: spacing['2xl'],
    width: '100%',
    alignItems: 'center',
  },
  metadataWrapper: {
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: spacing.xs,
    padding: spacing.lg,
    width: '100%',
  },
  metadataTitle: {
    marginBottom: spacing.base,
  },
  metadataItem: {
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  artistListBelow: {
    marginTop: spacing['4xl'], // Space below the centered card
    paddingHorizontal: spacing['3xl'],
    paddingTop: spacing.lg,
  },
  biteContainer: {
    marginTop: spacing['2xl'],
    width: '100%',
    alignItems: 'center',
  },
  bitesContainer: {
    marginTop: spacing['2xl'],
    width: '100%',
    alignItems: 'center',
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
    alignSelf: 'center'
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
    fontFamily: 'IBM Plex Mono',
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing['3xl'],
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
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
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  finishButtonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: 217,
    marginTop: spacing.base,
    alignSelf: 'center',
  },
  backArrowContainer: {
    backgroundColor: 'rgba(242, 242, 242, 0.2)',
    borderRadius: spacing.lg,
    padding: spacing.sm,
    shadowColor: 'rgba(13, 39, 80, 0.2)',
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 5,
    elevation: 4,
  },
  backArrowIcon: {
    fontSize: 32,
    color: colors.black,
    lineHeight: 32,
  },
  finishText: {
    fontSize: 15,
    fontWeight: '300',
    color: '#767676',
    letterSpacing: 0.28,
    textAlign: 'right',
  },
  manualInputPrompt: {
    marginBottom: spacing.lg,
    alignItems: 'center',
    gap: spacing.base,
    paddingVertical: spacing.lg,
  },
  manualInputText: {
    textAlign: 'center',
    color: colors.darkGrey,
    fontFamily: 'IBM Plex Mono',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing['2xl'],
    width: width - 80,
    gap: spacing.lg,
    ...shadows.lg,
  },
  modalTitle: {
    textAlign: 'center',
    marginBottom: spacing.base,
  },
  inputContainer: {
    gap: spacing.sm,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.base,
    fontFamily: 'IBM Plex Mono',
    fontSize: 16,
    color: colors.black,
    borderWidth: 1,
    borderColor: colors.darkGrey,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: spacing.base,
    justifyContent: 'space-between',
    marginTop: spacing.base,
  },
  toggleBackgroundContainer: {
    marginTop: spacing.lg,
    alignItems: 'center',
    width: '100%',
  },
  backgroundLoadingContainer: {
    marginTop: spacing.base,
    width: '100%',
    alignItems: 'center',
  },
  // Exploration Overlay Styles
  explorationOverlay: {
    flex: 1,
    height: height * 0.9,
    justifyContent: 'flex-end',
  },
  explorationContent: {
    backgroundColor: 'rgba(255, 255, 255, 0.47)',
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    height: height * 0.9,
    overflow: 'hidden',
  },
  explorationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing['xl'],
    paddingVertical: spacing.lg,
  },
  closeButton: {
    fontSize: 28,
    fontWeight: '300',
    color: colors.darkGrey,
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
    flexDirection: 'row',
    gap: spacing.base,
    paddingHorizontal: spacing['2xl'],
    paddingVertical: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.midGrey,
    justifyContent: 'space-between',
  },
});