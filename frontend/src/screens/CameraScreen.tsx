import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  Alert,
  Platform,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { cameraStyles as styles } from './styles/CameraStyles';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  PhotoFile,
  TakePhotoOptions
} from 'react-native-vision-camera';
import { API_BASE_URL, API_ENDPOINTS } from '../constants/api';
import { artistAnalysisCache } from '../utils/artistAnalysisCache';
import { ScanlinesEffect, ActionButton } from '../components';
import { launchImageLibrary } from 'react-native-image-picker';
import { colors } from '../constants/colors';
import { CameraRoll } from '@react-native-camera-roll/camera-roll';
import { compressImage, getCompressionSettings } from '../utils/imageUtils';

interface CameraScreenProps {
  onBack: () => void;
  onPhotoTaken?: (photoUri: string) => void;
}

// Camera Screen Component
export default function CameraScreen({ onBack, onPhotoTaken }: CameraScreenProps) {
  const safeAreaInsets = useSafeAreaInsets();
  const { height } = Dimensions.get('window');
  const [isCameraOn] = useState(true);

  // Animation value for curtain effect (0 = closed, 1 = fully open/scrolled up)
  const curtainTranslateY = useSharedValue(0);

  // Camera setup
  const { hasPermission, requestPermission } = useCameraPermission();
  const position = 'back'
  const device = useCameraDevice(position);
  const camera = useRef<Camera>(null);

  useEffect(() => {
    checkCameraPermission();
  }, []);

  const checkCameraPermission = async () => {
    if (!hasPermission) {
      const permission = await requestPermission();
      if (!permission) {
        Alert.alert(
          'Camera Permission Required',
          'Musee needs camera access to capture artwork photos.',
          [{ text: 'OK' }]
        );
      }
    }
    
    // Camera turning on - scroll curtain up
    curtainTranslateY.value = withTiming(-height, {
      duration: 800,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    });
  };

  const handleTakePhoto = async () => {
    try {
      if (camera.current == null) {
        throw new Error('Camera not available');
      }

      const options: TakePhotoOptions = {
        // qualityPrioritization: 'quality',
        flash: 'off',
        enableAutoRedEyeReduction: true,
      };

      const photo: PhotoFile = await camera.current.takePhoto(options);
      const tempPhotoUri = `file://${photo.path}`;
      console.log('Photo captured (temp):', tempPhotoUri);

      // Immediately save to camera roll in "Musee" album to get persistent ph:// identifier
      const savedAsset = await CameraRoll.saveAsset(tempPhotoUri, {
        type: 'photo',
        album: 'Musee',
      });

      // Get the persistent ph:// URI
      const persistentPhotoUri = savedAsset.node.image.uri;
      console.log('Photo saved to camera roll:', persistentPhotoUri);

      // Start API call with the temporary file URI (for immediate analysis)
      startArtistAnalysis(tempPhotoUri);

      if (onPhotoTaken) {
        // Pass the persistent ph:// URI for saving to database
        onPhotoTaken(persistentPhotoUri);
      } else {
        Alert.alert('Photo Captured!', `Saved to: ${photo.path}`);
      }

    } catch (error) {
      console.error('Failed to take photo:', error);
      Alert.alert('Error', 'Failed to take photo. Please try again.');
    }
  };

  const handleUseTestImage = () => {
    // For simulator/development: Use test image from assets
    const testImage = require('../../assets/test/IMG_7647.jpeg');
    const resolvedImage = Image.resolveAssetSource(testImage);
    const photoUri = resolvedImage.uri;

    console.log('Using test image:', photoUri);

    // Start API call
    startArtistAnalysis(photoUri);

    if (onPhotoTaken) {
      onPhotoTaken(photoUri);
    }
  };

  const handleImportFromAlbum = async () => {
    try {
      // Launch the iOS native photo picker
      const result = await launchImageLibrary({
        mediaType: 'photo',
        selectionLimit: 1,
        quality: 1,
      });

      // User cancelled the picker
      if (result.didCancel) {
        console.log('User cancelled photo picker');
        return;
      }

      // Error occurred
      if (result.errorCode) {
        console.error('ImagePicker Error:', result.errorMessage);
        Alert.alert('Error', 'Failed to access photo library. Please grant permission in Settings.');
        return;
      }

      // Photo selected
      if (result.assets && result.assets.length > 0) {
        const originalUri = result.assets[0].uri;
        if (originalUri) {
          console.log('Photo imported from album:', originalUri);

          // Check if we already have a ph:// URI (Photos library identifier)
          // If so, use it directly. If it's a file:// URI, we need to get the ph:// reference
          let persistentPhotoUri = originalUri;

          // The iOS image picker returns ph:// URIs when selecting from Photos library
          // We only need to save if it's NOT already a ph:// URI
          if (!originalUri.startsWith('ph://')) {
            try {
              console.log('Converting file:// URI to ph:// identifier...');
              const savedAsset = await CameraRoll.saveAsset(originalUri, {
                type: 'photo',
                album: 'Musee',
              });
              persistentPhotoUri = savedAsset.node.image.uri;
              console.log('Photo saved to Musee album with ph:// URI:', persistentPhotoUri);
            } catch (saveError) {
              console.error('Failed to save to Musee album, using original URI:', saveError);
            }
          } else {
            console.log('Using existing ph:// URI from Photos library:', originalUri);
          }

          // Start API call with original URI (might be file:// for immediate access)
          startArtistAnalysis(originalUri);

          if (onPhotoTaken) {
            // Pass the persistent ph:// URI for database storage
            onPhotoTaken(persistentPhotoUri);
          }
        }
      }
    } catch (error) {
      console.error('Failed to import from album:', error);
      Alert.alert('Error', 'Failed to access photo library. Please try again.');
    }
  };

  const startArtistAnalysis = async (photoUri: string) => {
    try {
      // Compress image before uploading to avoid 413 errors (Vercel 4.5MB limit)
      console.log('[CameraScreen] Compressing image for API upload...');
      const compressed = await compressImage(photoUri, getCompressionSettings());
      const uploadUri = compressed.uri;
      console.log(`[CameraScreen] Using ${compressed.size > 0 ? 'compressed' : 'original'} image for upload`);

      const formData = new FormData();
      formData.append('image', {
        uri: uploadUri,
        type: 'image/jpeg',
        name: 'artwork.jpg',
      } as any);

      const analyze_url = `${API_BASE_URL}${API_ENDPOINTS.ANALYZE_ARTIST}`
      console.log('=== STARTING ARTIST ANALYSIS ===');
      console.log('URL:', analyze_url);
      console.log('Photo URI:', photoUri);
      console.log('Upload URI:', uploadUri);

      // Create and cache the promise
      const analysisPromise = fetch(analyze_url, {
        method: 'POST',
        body: formData,
      }).then(async response => {
        console.log('=== API RESPONSE ===');
        console.log('Status:', response.status);
        console.log('OK:', response.ok);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Error response:', errorText);
          throw new Error(`API request failed with status ${response.status}: ${errorText}`);
        }

        const jsonData = await response.json();
        console.log('Response data:', JSON.stringify(jsonData));
        return jsonData;
      }).catch(error => {
        console.error('=== FETCH ERROR ===');
        console.error('Error:', error);
        throw error;
      });

      // Store in cache so PhotoDisplayScreen can use it
      artistAnalysisCache.set(photoUri, analysisPromise);

    } catch (error) {
      console.error('Failed to start artist analysis:', error);
    }
  };

  // Animated style for the curtain overlay
  const curtainAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: curtainTranslateY.value }],
    };
  });

  const renderCameraView = () => {
    if (!hasPermission) {
      return (
        <View style={styles.closedCamera}>
          <Text style={styles.cameraOffText}>Camera permission required</Text>
          <Text style={styles.cameraOffSubtext}>Please grant camera access to continue</Text>
        </View>
      );
    }

    if (!device) {
      // In simulator, allow using test image
      const isSimulator = Platform.OS === 'ios' && !Platform.isPad && Platform.isTVOS === false;

      return (
        <View style={styles.closedCamera}>
          <Text style={styles.cameraOffText}>No camera device found</Text>
          <Text style={styles.cameraOffSubtext}>
            {isSimulator ? 'Running in simulator' : 'Please check your device'}
          </Text>

          {__DEV__ && (
            <TouchableOpacity
              style={styles.devButton}
              onPress={handleUseTestImage}
              activeOpacity={0.7}
            >
              <Text style={styles.devButtonText}>Use Test Image (Dev)</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }

    return (
      <>
        {/* Always render the camera when device is available */}
        <Camera
          ref={camera}
          style={styles.camera}
          device={device}
          isActive={isCameraOn}
          photo={true}
          enableZoomGesture={true}
        />

        {/* Animated curtain overlay */}
        <Animated.View
          style={[
            styles.curtainOverlay,
            curtainAnimatedStyle,
          ]}
        >
          <ScanlinesEffect />
          <Text style={styles.cameraOffText}>Camera is sleeping.</Text>
          <Text style={styles.cameraOffSubtext}>Don't ever try to open the blind.</Text>
        </Animated.View>
      </>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: safeAreaInsets.top }]}>
      {/* Back Arrow */}
      <TouchableOpacity
        style={[styles.backButton, { top: safeAreaInsets.top + 16 }]}
        onPress={onBack}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <Path
            d="M15 18L9 12L15 6"
            stroke={colors.darkGrey}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </TouchableOpacity>

      {/* Camera Viewfinder Area */}
      <View style={[styles.cameraViewfinder]}>
        {renderCameraView()}
      </View>

      {/* Bottom Control Panel */}
      <View style={styles.controlsContainer}>
        {/* Album button - Secondary action */}
        <ActionButton
          label="album"
          onPress={handleImportFromAlbum}
          theme="light"
          // style={[styles.largeButton, {backgroundColor: colors.white}]}
        />
        {/* Capture button - Primary action */}
        <ActionButton
          label="capture"
          onPress={handleTakePhoto}
          disabled={!isCameraOn}
          theme="dark"
          style={styles.largeButton}
        />
      </View>
    </View>
  );
}