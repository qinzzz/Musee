import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Animated,
  Alert,
  PanResponder,
  Easing,
} from 'react-native';
import { BlurView } from '@react-native-community/blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';
import { API_BASE_URL, API_ENDPOINTS } from '../constants/api';
import { artistAnalysisCache } from '../utils/artistAnalysisCache';
import { Typography, Heading2, Body, Label, LoadingProgressBar, ArtworkCard, ArtistInfoCard, FramedArtworkCard, ArtistCard, ActionButton } from '../components';
import { spacing, shadows, borderRadius, animations } from '../constants/theme';

interface PhotoDisplayScreenProps {
  photoUri: string;
  onPhotoPress: () => void;
  onBack: () => void;
  onFinish?: () => void;
}

interface Artist {
  artist_name: string;
  score: number;
  reason: string;
}

const { width, height } = Dimensions.get('window');

export default function PhotoDisplayScreen({
  photoUri,
  onPhotoPress,
  onBack,
  onFinish
}: PhotoDisplayScreenProps) {
  const safeAreaInsets = useSafeAreaInsets();
  const [isFlipped, setIsFlipped] = useState(false);
  const flipAnimation = useRef(new Animated.Value(0)).current;
  const [artists, setArtists] = useState<Artist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedArtistIndex, setExpandedArtistIndex] = useState<number | null>(null);
  const swipeTranslateX = useRef(new Animated.Value(0)).current;
  const cardSlideAnim = useRef(new Animated.Value(-height)).current; // Start from above screen
  const cardDragX = useRef(new Animated.Value(0)).current;
  const cardDragY = useRef(new Animated.Value(0)).current;
  const [showArtistDetail, setShowArtistDetail] = useState(false);

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

  // Pan responder for card dragging (simplified - no movement to top)
  const cardPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        // Set offset to current values
        cardDragX.setOffset((cardDragX as any)._value);
        cardDragY.setOffset((cardDragY as any)._value);
        cardDragX.setValue(0);
        cardDragY.setValue(0);
      },
      onPanResponderMove: Animated.event(
        [
          null,
          { dx: cardDragX, dy: cardDragY }
        ],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: () => {
        // Always spring X and Y back to center position
        Animated.spring(cardDragX, {
          toValue: 0,
          useNativeDriver: true,
          ...animations.spring.default,
        }).start(() => {
          cardDragX.flattenOffset();
        });

        Animated.spring(cardDragY, {
          toValue: 0,
          useNativeDriver: true,
          ...animations.spring.default,
        }).start(() => {
          cardDragY.flattenOffset();
        });
      },
    })
  ).current;

  useEffect(() => {
    setIsLoading(true);
    // Animate card sliding down like Instax camera, then stay in center
    Animated.timing(cardSlideAnim, {
      toValue: 0,
      duration: animations.timing.slow,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    fetchArtistIdentification();

    // Cleanup cache when component unmounts
    return () => {
      artistAnalysisCache.clear(photoUri);
    };
  }, []);

  const fetchArtistIdentification = async () => {
    try {
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

        const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.ANALYZE_ARTIST}`, {
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
      } catch (parseError) {
        console.error('Failed to parse artist data:', parseError);
        console.error('Raw data:', data.analysis);
        throw new Error('Invalid artist data format');
      }

      // Filter and process artists
      // 1. If there's any "Unknown" artist, keep only one and replace name
      // 2. Otherwise, keep all artists
      const hasUnknown = artistsData.some(artist =>
        artist.artist_name.toLowerCase() === 'unknown'
      );

      if (hasUnknown) {
        // Find the first Unknown artist and modify it
        const unknownArtist = artistsData.find(artist =>
          artist.artist_name.toLowerCase() === 'unknown'
        );
        if (unknownArtist) {
          unknownArtist.artist_name = 'Not an artwork?';
          artistsData = [unknownArtist]; // Only show this one
        }
      }

      setArtists(artistsData);
    } catch (error) {
      console.error('Error fetching artist identification:', error);
      Alert.alert(
        'Error',
        'Failed to identify artists. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsLoading(false);
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

  const handleArtistPress = (index: number) => {
    // Toggle expanded state
    setExpandedArtistIndex(expandedArtistIndex === index ? null : index);
  };

  const handleArtistSelect = (artistName: string) => {
    // Navigate to artist identification screen
    onPhotoPress();
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
          <View style={styles.contentWrapper}>
            {/* Flippable Card Container */}
            <Animated.View
              style={[
                styles.cardContainer,
                {
                  transform: [
                    { translateX: cardDragX },
                    { translateY: Animated.add(cardSlideAnim, cardDragY) },
                  ],
                },
              ]}
              {...cardPanResponder.panHandlers}
            >
              {/* Front of Card - Image */}
              <TouchableOpacity
                activeOpacity={0.95}
                onPress={handleCardPress}
              >
                <Animated.View
                  style={[
                    {
                      transform: [{ rotateY: frontInterpolate }],
                      opacity: frontOpacity,
                    },
                  ]}
                >
                  <FramedArtworkCard photoUri={photoUri}/>
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
                    // styles.imageContainer,
                    {
                      transform: [{ rotateY: backInterpolate }],
                      opacity: backOpacity,
                    },
                  ]}
                >
                  <FramedArtworkCard>
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
                  </FramedArtworkCard>
                </Animated.View>
              </TouchableOpacity>
            </Animated.View>

            {/* Artist List or Artist Detail Below Card (always visible) */}
            <View style={styles.artistListBelow}>
              {isLoading ? (
                <>
                  <LoadingProgressBar message="Recognizing..." />
                </>
              ) : (
                  <>
                    <View style={styles.artistListCentered}>
                      {artists.map((artist, index) => {
                        const isExpanded = expandedArtistIndex === index;
                        return (
                          <ArtistCard
                            key={index}
                            artistName={artist.artist_name}
                            details={`Confidence: ${artist.score * 10}%`}
                            description={artist.reason}
                            isExpanded={isExpanded}
                            onPress={() => handleArtistPress(index)}
                          />
                        );
                      })}
                    </View>

                    {/* Action buttons */}
                    <View style={styles.actionButtonsContainer}>
                      <ActionButton
                        label="Continue"
                        onPress={() => setShowArtistDetail(true)}
                      />
                      <ActionButton
                        label="Maybe later"
                        onPress={onFinish}
                      />
                    </View>
                  </>
                )}
            </View>
          </View>
        </Animated.View>
      </View>
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
  contentWrapper: {
    alignItems: 'center',
  },
  imageContainer: {
    width: width - 80, // 40px padding on each side
    backgroundColor: '#FDFDFD',
    borderRadius: borderRadius.lg,
    ...shadows.lg,
    padding: spacing.lg,
    paddingBottom: spacing['5xl'],
    alignSelf: 'center',
    backfaceVisibility: 'hidden',
  },
  artworkImage: {
    width: '100%',
    height: 440,
    // borderRadius: 5,
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
  metadataWrapper: {
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    gap: spacing.xs,
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
  actionButtonsContainer: {
    flexDirection: 'row',
    gap: 18,
    marginTop: spacing['3xl'],
    justifyContent: 'center',
    alignItems: 'center',
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
});