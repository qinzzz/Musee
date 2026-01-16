import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  Animated,
  PanResponder,
  Alert,
  Keyboard,
  TouchableOpacity,
  KeyboardAvoidingView,
  Modal,
  Image,
  StatusBar,
  ScrollView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';
import {
  Typography,
  Toast,
  ArrowIcon,
  SavedArtworkDetailHeader,
  ImmersiveExplorationPanel,
  ArtworkDetailCard,
  TagManager
} from '../components';
import { normalizeImageUri } from '../utils/imageUtils';
import { spacing, animations, borderRadius, shadows } from '../constants/theme';
import { savedArtworkApiService } from '../services/savedArtworkApi';
import { artworkCacheService } from '../services/artworkCache';
import { useSavedArtwork } from '../hooks/useSavedArtwork';
import { collectionApiService, Collection } from '../services/collectionApi';
import { artistAnalysisCache } from '../utils/artistAnalysisCache';
import { FlatList } from 'react-native';

const { width, height } = Dimensions.get('window');

export default function SavedArtworkDetailScreen({ route, navigation }: any) {
  const {
    artworkId,
    initialPhotoUri,
    initialBackgroundColor,
    artworkItems = [],
    useBlurBackground = true,
  } = route.params || {};

  const safeAreaInsets = useSafeAreaInsets();
  const {
    artwork,
    photoUri,
    backgroundColor,
    artworkBites,
    isBiteLoading,
    suggestedTopics,
    isTopicLoading,
    fetchArtworkBite,
    fetchSuggestedTopics,
    refresh,
  } = useSavedArtwork(artworkId, initialPhotoUri, initialBackgroundColor);

  const [showToast, setShowToast] = useState(false);
  const [isExplorationVisible, setIsExplorationVisible] = useState(false);
  const isExplorationVisibleRef = useRef(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [isFullScreenImage, setIsFullScreenImage] = useState(false);
  const [currentSelectedTopic, setCurrentSelectedTopic] = useState<string | null>(null);
  const [showCollectionModal, setShowCollectionModal] = useState(false);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [isAddingToCollection, setIsAddingToCollection] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [swipeDirection, setSwipeDirection] = useState<'next' | 'prev' | null>(null);

  // Animation values
  const swipeTranslateX = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0.3)).current;
  const cardOpacity = useRef(new Animated.Value(1)).current;
  const explorationTranslateY = useRef(new Animated.Value(height - 100)).current;
  const screenSlideX = useRef(new Animated.Value(width)).current;

  const artworkIdRef = useRef(artworkId);
  artworkIdRef.current = artworkId;

  const artworkItemsRef = useRef(artworkItems);
  artworkItemsRef.current = artworkItems;

  useEffect(() => {
    isExplorationVisibleRef.current = isExplorationVisible;
  }, [isExplorationVisible]);

  useEffect(() => {
    // Pulse animation logic
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.8, duration: 2500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 2500, useNativeDriver: true }),
      ])
    ).start();

    const showSub = Platform.OS === 'ios' ? Keyboard.addListener('keyboardWillShow', () => setIsKeyboardVisible(true)) : null;
    const hideSub = Platform.OS === 'ios' ? Keyboard.addListener('keyboardWillHide', () => setIsKeyboardVisible(false)) : null;

    return () => {
      showSub?.remove();
      hideSub?.remove();
    };
  }, []);

  useEffect(() => {
    // Reset positions for the new artwork entrance
    const startValue = swipeDirection === 'prev' ? -width : width;
    screenSlideX.setValue(startValue);
    swipeTranslateX.setValue(0);

    Animated.spring(screenSlideX, {
      toValue: 0,
      useNativeDriver: true,
      tension: 65,
      friction: 10,
    }).start(() => {
      // Clear direction after entrance
      setSwipeDirection(null);
    });
  }, [artworkId]);

  useEffect(() => {
    if (isExplorationVisible && artwork && artworkBites.length === 0) {
      fetchArtworkBite();
    } else if (isExplorationVisible && artwork && artworkBites.length > 0) {
      fetchSuggestedTopics(artworkId);
    }
  }, [isExplorationVisible, artwork]);

  const handleAddToCollection = async () => {
    try {
      const data = await collectionApiService.getCollections();
      setCollections(data);
      setShowCollectionModal(true);
    } catch (error) {
      console.error('Failed to load collections:', error);
      Alert.alert('Error', 'Failed to load collections.');
    }
  };

  const addArtworkToCollection = async (collectionId: string) => {
    setIsAddingToCollection(true);
    try {
      await collectionApiService.addArtworkToCollection(collectionId, artworkId);
      setShowCollectionModal(false);
      // Optional: Show some feedback
      Alert.alert('Success', 'Added to collection!');
    } catch (error) {
      console.error('Failed to add to collection:', error);
      Alert.alert('Error', 'Failed to add to collection.');
    } finally {
      setIsAddingToCollection(false);
    }
  };

  const handleBackPress = () => {
    if (isExplorationVisible) {
      setIsExplorationVisible(false);
      Animated.parallel([
        Animated.timing(cardOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(explorationTranslateY, { toValue: height - 100, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      navigation.goBack();
    }
  };

  const handleDelete = () => {
    Alert.alert('Delete Artwork', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await savedArtworkApiService.deleteSavedArtwork(artworkId);
            setShowToast(true);
          } catch (e) {
            Alert.alert('Error', 'Failed to delete.');
          }
        }
      }
    ]);
  };

  const handleRegenerate = async () => {
    if (isRegenerating) return;

    setIsRegenerating(true);
    try {
      // Clear cache to force a fresh identification
      artistAnalysisCache.clear(photoUri);

      const data = await savedArtworkApiService.identifyArtist(photoUri);

      let artistsData;
      let analysisContent = '';
      let tagsString = '';

      let analysisText = data.analysis;
      if (typeof analysisText === 'string') {
        analysisText = analysisText.trim();
        const codeBlockRegex = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/;
        const match = analysisText.match(codeBlockRegex);
        if (match) {
          analysisText = match[1].trim();
        }
        artistsData = JSON.parse(analysisText);
      } else {
        artistsData = analysisText;
      }

      const lastItem = artistsData[artistsData.length - 1];
      if (lastItem && 'analysis' in lastItem && !('artist_name' in lastItem)) {
        analysisContent = lastItem.analysis || '';
        tagsString = lastItem.tags || '';
        artistsData = artistsData.slice(0, -1);
      }

      if (artistsData.length > 0) {
        const topArtist = artistsData[0];

        // Update the artwork in DB
        const updated = await savedArtworkApiService.updateSavedArtwork(
          artworkId,
          topArtist.artist_name,
          topArtist.artwork_name || 'Unknown',
          undefined, // Keep existing summary for now
          undefined, // Keep existing palette
          analysisContent,
          tagsString
        );

        artworkCacheService.set(artworkId, updated);
        await refresh();
        Alert.alert('Success', 'Artwork re-analyzed successfully!');
      }
    } catch (error) {
      console.error('Failed to regenerate analysis:', error);
      Alert.alert('Error', 'Failed to regenerate analysis.');
    } finally {
      setIsRegenerating(false);
    }
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        const startX = evt.nativeEvent.pageX - gestureState.dx;
        const startY = evt.nativeEvent.pageY - gestureState.dy;
        const fromLeftEdge = startX < 50;
        const fromTopEdge = startY < (safeAreaInsets.top + 100);
        const fromLowerThird = startY > height * 0.7; // Only capture swipe-up from lower 30%
        const fromCenterArea = startY > height * 0.2 && startY < height * 0.8 && startX > width * 0.1 && startX < width * 0.9;
        const isHorizontal = Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
        const isVertical = Math.abs(gestureState.dy) > Math.abs(gestureState.dx);

        // Only capture swipe-up gesture if it starts from the lower 30% of the screen
        const shouldCaptureSwipeUp = !isKeyboardVisible && gestureState.dy < -5 && isVertical && fromLowerThird && !isExplorationVisibleRef.current;
        // Capture swipe-down to close exploration panel from anywhere
        const shouldCaptureSwipeDown = gestureState.dy > 5 && fromTopEdge && isVertical && isExplorationVisibleRef.current;
        const shouldCaptureBackSwipe = fromLeftEdge && gestureState.dx > 5 && isHorizontal;
        const shouldCaptureNavSwipe = fromCenterArea && Math.abs(gestureState.dx) > 5 && isHorizontal && !isExplorationVisibleRef.current;

        return shouldCaptureBackSwipe || shouldCaptureSwipeUp || shouldCaptureSwipeDown || shouldCaptureNavSwipe;
      },
      onPanResponderMove: (evt, gestureState) => {
        const isHorizontal = Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
        const isVertical = Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
        const startX = evt.nativeEvent.pageX - gestureState.dx;
        const fromLeftEdge = startX < 50;

        if (isHorizontal && (fromLeftEdge || !isExplorationVisibleRef.current)) {
          swipeTranslateX.setValue(gestureState.dx);
        }

        if (isVertical) {
          if (isExplorationVisibleRef.current && gestureState.dy > 0) {
            explorationTranslateY.setValue(gestureState.dy);
          } else if (!isExplorationVisibleRef.current && gestureState.dy < 0) {
            explorationTranslateY.setValue(Math.min(Math.max(0, height + gestureState.dy), height - 100));
          }
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        const isVertical = Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
        const threshold = height * 0.2;

        if (isVertical && gestureState.dy < -50 && !isExplorationVisibleRef.current && gestureState.dy < -threshold) {
          setIsExplorationVisible(true);
          Animated.parallel([
            Animated.timing(cardOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
            Animated.timing(explorationTranslateY, { toValue: 0, duration: 200, useNativeDriver: true }),
          ]).start();
        } else if (isVertical && gestureState.dy > 50 && isExplorationVisibleRef.current && gestureState.dy > threshold) {
          setIsExplorationVisible(false);
          Animated.parallel([
            Animated.timing(cardOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
            Animated.timing(explorationTranslateY, { toValue: height - 100, duration: 200, useNativeDriver: true }),
          ]).start();
        } else {
          const swipeThreshold = width / 4;
          if (Math.abs(gestureState.dx) > swipeThreshold && !isExplorationVisibleRef.current && artworkItemsRef.current.length > 0) {
            const index = artworkItemsRef.current.findIndex((item: any) => item.id === artworkIdRef.current);
            let nextItem = null;
            let direction: 'next' | 'prev' | null = null;

            if (gestureState.dx > 0 && index > 0) {
              // Swipe right -> Previous artwork
              nextItem = artworkItemsRef.current[index - 1];
              direction = 'prev';
            } else if (gestureState.dx < 0 && index < artworkItemsRef.current.length - 1) {
              // Swipe left -> Next artwork
              nextItem = artworkItemsRef.current[index + 1];
              direction = 'next';
            }

            if (nextItem) {
              setSwipeDirection(direction);
              // Animate current screen out
              Animated.timing(swipeTranslateX, {
                toValue: direction === 'next' ? -width : width,
                duration: 200,
                useNativeDriver: true,
              }).start(() => {
                navigation.setParams({
                  artworkId: nextItem.id,
                  initialPhotoUri: nextItem.uri,
                  initialBackgroundColor: nextItem.backgroundColor
                });
              });
              return;
            }
          }

          // Fallback: simple bounce back if no swipe happened
          Animated.spring(swipeTranslateX, { toValue: 0, useNativeDriver: true, ...animations.spring.stiff }).start();
          Animated.spring(explorationTranslateY, {
            toValue: isExplorationVisibleRef.current ? 0 : height - 100,
            useNativeDriver: true,
            ...animations.spring.stiff
          }).start();
        }
      },
    })
  ).current;

  return (
    <View style={styles.container}>
      {/* Background Container for Scroll Content - This part SWIPES */}
      <Animated.View
        style={[
          styles.overlayContainer,
          {
            transform: [{ translateX: Animated.add(swipeTranslateX, screenSlideX) }]
          }
        ]}
      >
        <Animated.View style={styles.swipeOverlay} {...panResponder.panHandlers}>
          <KeyboardAvoidingView
            style={styles.keyboardAvoidView}
            behavior="padding"
            keyboardVerticalOffset={0}
          >
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{
                paddingTop: safeAreaInsets.top + 80, // Space for stationary header
                alignItems: 'center',
                paddingBottom: 150 // Space for stationary peek panel
              }}
              showsVerticalScrollIndicator={false}
              bounces={true}
              scrollEnabled={!isExplorationVisible}
            >
              <ArtworkDetailCard
                artwork={artwork}
                photoUri={photoUri}
                backgroundColor={backgroundColor}
                cardOpacity={cardOpacity}
                onImagePress={() => setIsFullScreenImage(true)}
                onEdit={async (artist, title, summary) => {
                  const updated = await savedArtworkApiService.updateSavedArtwork(artworkId, artist, title, summary);
                  artworkCacheService.set(artworkId, updated);
                }}
                onRegenerate={handleRegenerate}
                isRegenerating={isRegenerating}
                onTagsUpdated={() => {
                  artworkCacheService.invalidate(artworkId);
                  refresh();
                }}
              />
            </ScrollView>
          </KeyboardAvoidingView>
        </Animated.View>
      </Animated.View>

      {/* Stationary Top Navigation Bar */}
      <SavedArtworkDetailHeader
        onBack={handleBackPress}
        onDelete={handleDelete}
        onAddToCollection={handleAddToCollection}
        isExplorationVisible={isExplorationVisible}
      />

      {/* Stationary Bottom Exploration Panel */}
      <ImmersiveExplorationPanel
        translateY={explorationTranslateY}
        pulseAnim={pulseAnim}
        isVisible={isExplorationVisible}
        artwork={artwork}
        artworkBites={artworkBites}
        isBiteLoading={isBiteLoading}
        isTopicLoading={isTopicLoading}
        suggestedTopics={suggestedTopics}
        onFetchBite={(topic) => {
          setCurrentSelectedTopic(topic || null);
          fetchArtworkBite(topic);
        }}
        onShuffleTopics={() => {
          fetchSuggestedTopics(artworkId);
        }}
        onClose={handleBackPress}
        useBlurBackground={useBlurBackground}
        backgroundColor={backgroundColor}
        photoUri={photoUri}
        currentSelectedTopic={currentSelectedTopic}
      />

      {/* Stationary Scroll Indicator */}
      {!isExplorationVisible && (
        <View style={styles.scrollIndicatorContainer} pointerEvents="none">
          <Animated.View style={{ opacity: pulseAnim, alignItems: 'center' }}>
            <ArrowIcon size={32} color={colors.darkGrey} direction="down" />
          </Animated.View>
        </View>
      )}

      <Toast
        message="Deleted successfully"
        visible={showToast}
        onHide={() => {
          setShowToast(false);
          navigation.goBack();
        }}
      />

      <Modal visible={isFullScreenImage} transparent={false} animationType="fade" onRequestClose={() => setIsFullScreenImage(false)}>
        <View style={styles.fullScreenContainer}>
          <StatusBar hidden />
          <Image source={{ uri: normalizeImageUri(photoUri) }} style={styles.fullScreenImage} resizeMode="contain" />
          <TouchableOpacity style={[styles.fullScreenCloseButton, { top: safeAreaInsets.top + 10 }]} onPress={() => setIsFullScreenImage(false)}>
            <View style={styles.closeButtonCircle}><Typography style={styles.closeButtonText}>✕</Typography></View>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Collection Selection Modal */}
      <Modal
        visible={showCollectionModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowCollectionModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.collectionModalContainer, { paddingBottom: safeAreaInsets.bottom + 20 }]}>
            <View style={styles.modalHeader}>
              <Typography variant="h2" style={styles.modalTitle}>Select Collection</Typography>
              <TouchableOpacity onPress={() => setShowCollectionModal(false)}>
                <Typography style={styles.closeButton}>Cancel</Typography>
              </TouchableOpacity>
            </View>

            <FlatList
              data={collections}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.collectionItem}
                  onPress={() => addArtworkToCollection(item.id)}
                  disabled={isAddingToCollection}
                >
                  <Typography style={styles.collectionItemText}>{item.name}</Typography>
                  <Typography variant="caption" style={styles.collectionCountText}>
                    {item.artwork_count} items
                  </Typography>
                </TouchableOpacity>
              )}
              ListEmptyComponent={() => (
                <View style={styles.emptyContainer}>
                  <Typography style={styles.emptyCollectionsText}>No collections found.</Typography>
                  <TouchableOpacity
                    style={styles.createCollectionButton}
                    onPress={() => {
                      setShowCollectionModal(false);
                      navigation.navigate('Collections');
                    }}
                  >
                    <Typography style={styles.createCollectionButtonText}>Create New Collection</Typography>
                  </TouchableOpacity>
                </View>
              )}
              contentContainerStyle={styles.collectionList}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  overlayContainer: { flex: 1, backgroundColor: colors.white },
  backgroundContainer: { position: 'absolute', width, height, alignItems: 'center' },
  swipeOverlay: { flex: 1, width, height },
  keyboardAvoidView: { flex: 1, justifyContent: 'center' },
  contentWrapper: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollIndicatorContainer: { position: 'absolute', left: 0, right: 0, bottom: 56, alignItems: 'center' },
  fullScreenContainer: { flex: 1, backgroundColor: colors.black, justifyContent: 'center', alignItems: 'center' },
  fullScreenImage: { width: '100%', height: '100%' },
  fullScreenCloseButton: { position: 'absolute', right: 20 },
  closeButtonCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  closeButtonText: { fontSize: 24, color: colors.white, fontWeight: '300' },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  collectionModalContainer: {
    backgroundColor: colors.white,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    maxHeight: height * 0.7,
    padding: spacing.lg,
    ...shadows.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
    paddingBottom: spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: colors.lightGrey,
  },
  modalTitle: {
    fontSize: 20,
    color: colors.black,
  },
  closeButton: {
    color: colors.techBlue || '#007AFF',
    fontFamily: 'PP Neue Montreal Medium',
  },
  collectionList: {
    paddingVertical: spacing.sm,
  },
  collectionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.lightGrey,
  },
  collectionItemText: {
    fontSize: 16,
    color: colors.black,
  },
  collectionCountText: {
    color: colors.darkGrey,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: spacing['2xl'],
  },
  emptyCollectionsText: {
    color: colors.darkGrey,
    marginBottom: spacing.lg,
  },
  createCollectionButton: {
    paddingVertical: spacing.base,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.black,
    borderRadius: borderRadius.base,
  },
  createCollectionButtonText: {
    color: colors.white,
    fontFamily: 'PP Neue Montreal Medium',
  },
});
