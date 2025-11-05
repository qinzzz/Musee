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

      // Navigate to artist identification screen
      const photoUri = `file://${photo.path}`;
      console.log('Photo captured:', photoUri);

      // Start API call immediately (don't await)
      startArtistAnalysis(photoUri);

      if (onPhotoTaken) {
        onPhotoTaken(photoUri);
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
        const photoUri = result.assets[0].uri;
        if (photoUri) {
          console.log('Photo imported from album:', photoUri);

          // Start API call
          startArtistAnalysis(photoUri);

          if (onPhotoTaken) {
            onPhotoTaken(photoUri);
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
      const formData = new FormData();
      formData.append('image', {
        uri: photoUri,
        type: 'image/jpeg',
        name: 'artwork.jpg',
      } as any);

      const analyze_url = `${API_BASE_URL}${API_ENDPOINTS.ANALYZE_ARTIST}`
      console.log('=== STARTING ARTIST ANALYSIS ===');
      console.log('URL:', analyze_url);
      console.log('Photo URI:', photoUri);

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
        <ActionButton
          label="back"
          onPress={onBack}
          theme="light"
          // style={[styles.largeButton, {backgroundColor: colors.white}]}
        />

      </View>
    </View>
  );
}