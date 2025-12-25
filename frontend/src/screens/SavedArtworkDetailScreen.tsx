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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';
import {
  Typography,
  Toast,
  ArrowIcon,
  SavedArtworkDetailHeader,
  ImmersiveExplorationPanel,
  ArtworkDetailCard
} from '../components';
import { spacing, animations, borderRadius, shadows } from '../constants/theme';
import { savedArtworkApiService } from '../services/savedArtworkApi';
import { artworkCacheService } from '../services/artworkCache';
import { useSavedArtwork } from '../hooks/useSavedArtwork';

const { width, height } = Dimensions.get('window');

export default function SavedArtworkDetailScreen({ route, navigation }: any) {
  const {
    artworkId,
    initialPhotoUri,
    initialBackgroundColor,
    artworkIds = [],
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
  } = useSavedArtwork(artworkId, initialPhotoUri, initialBackgroundColor);

  const [showToast, setShowToast] = useState(false);
  const [isExplorationVisible, setIsExplorationVisible] = useState(false);
  const isExplorationVisibleRef = useRef(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [isFullScreenImage, setIsFullScreenImage] = useState(false);
  const [currentSelectedTopic, setCurrentSelectedTopic] = useState<string | null>(null);

  // Animation values
  const swipeTranslateX = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0.3)).current;
  const cardOpacity = useRef(new Animated.Value(1)).current;
  const explorationTranslateY = useRef(new Animated.Value(height - 100)).current;
  const screenSlideX = useRef(new Animated.Value(width)).current;

  const artworkIdsRef = useRef(artworkIds);
  artworkIdsRef.current = artworkIds;

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

    const showSub = Keyboard.addListener('keyboardWillShow', () => setIsKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardWillHide', () => setIsKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    screenSlideX.setValue(width);
    Animated.spring(screenSlideX, {
      toValue: 0,
      useNativeDriver: true,
      tension: 65,
      friction: 10,
    }).start();
  }, [artworkId]);

  useEffect(() => {
    if (isExplorationVisible && artwork && artworkBites.length === 0) {
      fetchArtworkBite();
    } else if (isExplorationVisible && artwork && artworkBites.length > 0) {
      fetchSuggestedTopics(artworkId);
    }
  }, [isExplorationVisible, artwork]);

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
          const swipeThreshold = width / 3;
          if (Math.abs(gestureState.dx) > swipeThreshold && !isExplorationVisibleRef.current && artworkIdsRef.current.length > 0) {
            const index = artworkIdsRef.current.indexOf(artworkId);
            if (gestureState.dx > 0 && index > 0) {
              navigation.setParams({ artworkId: artworkIdsRef.current[index - 1] });
            } else if (gestureState.dx < 0 && index < artworkIdsRef.current.length - 1) {
              navigation.setParams({ artworkId: artworkIdsRef.current[index + 1] });
            }
          }
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
      <Animated.View style={[styles.overlayContainer, { transform: [{ translateX: Animated.add(swipeTranslateX, screenSlideX) }] }]}>
        <SavedArtworkDetailHeader
          onBack={handleBackPress}
          onDelete={handleDelete}
          isExplorationVisible={isExplorationVisible}
        />

        <View style={styles.backgroundContainer}>
          <Animated.View style={styles.swipeOverlay} {...panResponder.panHandlers}>
            <KeyboardAvoidingView
              style={styles.keyboardAvoidView}
              behavior="padding"
              keyboardVerticalOffset={0}
            >
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingTop: safeAreaInsets.top, alignItems: 'center', paddingBottom: spacing['2xl'] }}
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
                />
              </ScrollView>

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

              {!isExplorationVisible && (
                <View style={styles.scrollIndicatorContainer} pointerEvents="none">
                  <Animated.View style={{ opacity: pulseAnim, alignItems: 'center' }}>
                    <ArrowIcon size={32} color={colors.darkGrey} direction="down" />
                  </Animated.View>
                </View>
              )}
            </KeyboardAvoidingView>
          </Animated.View>
        </View>

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
            <Image source={{ uri: photoUri }} style={styles.fullScreenImage} resizeMode="contain" />
            <TouchableOpacity style={[styles.fullScreenCloseButton, { top: safeAreaInsets.top + 10 }]} onPress={() => setIsFullScreenImage(false)}>
              <View style={styles.closeButtonCircle}><Typography style={styles.closeButtonText}>✕</Typography></View>
            </TouchableOpacity>
          </View>
        </Modal>
      </Animated.View >
    </View >
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
});
