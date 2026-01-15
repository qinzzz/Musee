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
import { savedArtworkApiService } from '../services/savedArtworkApi';
import { colors } from '../constants/colors';
import { useLanguage } from '../contexts/LanguageContext';
import { useIdentity } from '../contexts/IdentityContext';
import { CameraRoll } from '@react-native-camera-roll/camera-roll';
import { compressImage, getCompressionSettings, ensurePersistentImage } from '../utils/imageUtils';
import { extractMetadataFromAsset } from '../utils/metadataUtils';

export default function CameraScreen({ navigation }: any) {
  const safeAreaInsets = useSafeAreaInsets();
  const { language } = useLanguage();
  const { identity } = useIdentity();
  const { height } = Dimensions.get('window');
  const [isCameraOn] = useState(true);

  const curtainTranslateY = useSharedValue(0);

  const { hasPermission, requestPermission } = useCameraPermission();
  const position = 'back'
  const device = useCameraDevice(position);
  const camera = useRef<Camera>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (Platform.OS === 'web') {
      setupWebCamera();
    } else {
      checkCameraPermission();
    }
  }, []);

  const setupWebCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error('Error accessing web camera:', err);
    }
  };

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

    curtainTranslateY.value = withTiming(-height, {
      duration: 800,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    });
  };

  const handleTakePhoto = async () => {
    try {
      if (Platform.OS === 'web') {
        if (!videoRef.current) return;
        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(videoRef.current, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg');

        // Pre-warm identification (web)
        console.log('[CameraScreen] Pre-warming artist identification (web) for dataUrl');
        const identificationPromise = savedArtworkApiService.identifyArtist(dataUrl, identity, language);
        artistAnalysisCache.set(dataUrl, identificationPromise);

        navigation.navigate('ArtworkAnalysis', { photoUri: dataUrl, identity });
        return;
      }

      if (camera.current == null) {
        throw new Error('Camera not available');
      }

      const options: TakePhotoOptions = {
        flash: 'off',
        enableAutoRedEyeReduction: true,
      };

      const photo: PhotoFile = await camera.current.takePhoto(options);
      const tempPhotoUri = `file://${photo.path}`;
      console.log('Photo captured (temp):', tempPhotoUri);

      const savedAsset = await CameraRoll.saveAsset(tempPhotoUri, {
        type: 'photo',
        album: 'Musee',
      });

      const persistentPhotoUri = savedAsset.node.image.uri;
      console.log('Photo saved to camera roll:', persistentPhotoUri);

      // CRITICAL: Kick off identification early
      console.log('[CameraScreen] Pre-warming artist identification (capture) for:', persistentPhotoUri, 'with identity:', identity);
      const identificationPromise = savedArtworkApiService.identifyArtist(persistentPhotoUri, identity, language);
      artistAnalysisCache.set(persistentPhotoUri, identificationPromise);

      navigation.navigate('ArtworkAnalysis', { photoUri: persistentPhotoUri, identity });

    } catch (error) {
      console.error('Failed to take photo:', error);
      Alert.alert('Error', Platform.OS === 'web' ? 'Failed to access camera stream' : 'Failed to take photo. Please try again.');
    }
  };

  const handleUseTestImage = () => {
    const testImage = require('../../assets/test/IMG_7647.jpeg');
    const resolvedImage = Image.resolveAssetSource(testImage);
    const photoUri = resolvedImage.uri;

    // For test image, we can still pre-warm
    const identificationPromise = savedArtworkApiService.identifyArtist(photoUri, identity, language);
    artistAnalysisCache.set(photoUri, identificationPromise);
    navigation.navigate('ArtworkAnalysis', { photoUri, identity });
  };

  const handleImportFromAlbum = async () => {
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        selectionLimit: 1,
        quality: 1,
        includeExtra: true,
      });

      if (result.didCancel) return;

      if (result.errorCode) {
        Alert.alert('Error', 'Failed to access photo library. Please grant permission in Settings.');
        return;
      }

      if (result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const originalUri = asset.uri;
        if (originalUri) {
          const metadata = extractMetadataFromAsset(asset);

          // Ensure the image is stored permanently if it came from a temp folder
          const persistentUri = await ensurePersistentImage(originalUri);

          // Pre-warm identification
          console.log('[CameraScreen] Pre-warming artist identification (album) for:', persistentUri, 'with identity:', identity);
          const identificationPromise = savedArtworkApiService.identifyArtist(persistentUri, identity, language);
          artistAnalysisCache.set(persistentUri, identificationPromise);

          navigation.navigate('ArtworkAnalysis', {
            photoUri: persistentUri,
            metadata,
            identity
          });
        }
      }
    } catch (error) {
      console.error('Failed to import from album:', error);
      Alert.alert('Error', 'Failed to access photo library. Please try again.');
    }
  };


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
      const isSimulator = Platform.OS === 'ios' && !Platform.isPad && Platform.isTV === false;

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

    if (Platform.OS === 'web') {
      return (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      );
    }

    return (
      <>
        <Camera
          ref={camera}
          style={styles.camera}
          device={device}
          isActive={isCameraOn}
          photo={true}
          enableZoomGesture={true}
        />

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
      <TouchableOpacity
        style={[styles.backButton, { top: safeAreaInsets.top + 16 }]}
        onPress={() => navigation.goBack()}
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

      <View style={[styles.cameraViewfinder]}>
        {renderCameraView()}
      </View>

      <View style={styles.controlsContainer}>
        <ActionButton
          label="album"
          onPress={handleImportFromAlbum}
          theme="light"
        />
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