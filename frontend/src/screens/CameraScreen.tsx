import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableHighlight,
  Dimensions,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { styles } from '../styles/AppStyles';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  PhotoFile,
  TakePhotoOptions
} from 'react-native-vision-camera';

// Scanlines Effect Component
const ScanlinesEffect = () => {
  const { height } = Dimensions.get('window');
  const scanlines = [];
  
  // Create scanlines every 4 pixels
  for (let i = 0; i < height; i += 4) {
    scanlines.push(
      <View
        key={i}
        style={{
          position: 'absolute',
          top: i,
          left: 0,
          right: 0,
          height: 1,
          backgroundColor: '#333',
          opacity: 0.3,
        }}
      />
    );
  }
  
  return <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>{scanlines}</View>;
};

interface CameraScreenProps {
  onBack: () => void;
  onPhotoTaken?: (photoUri: string) => void;
}

// Camera Screen Component
export default function CameraScreen({ onBack, onPhotoTaken }: CameraScreenProps) {
  const safeAreaInsets = useSafeAreaInsets();
  const { width, height } = Dimensions.get('window');
  const [isCameraOn, setIsCameraOn] = useState(false);

  // Animation value for curtain effect (0 = closed, 1 = fully open/scrolled up)
  const curtainTranslateY = useSharedValue(0);

  // Camera setup
  const { hasPermission, requestPermission } = useCameraPermission();
  const position = onBack? 'back' : 'front'
  const device = useCameraDevice(position);
  const camera = useRef<Camera>(null);

  useEffect(() => {
    checkCameraPermission();
  }, []);

  const checkCameraPermission = async () => {
    if (hasPermission) {
      return;
    }
    
    const permission = await requestPermission();
    if (!permission) {
      Alert.alert(
        'Camera Permission Required',
        'Musee needs camera access to capture artwork photos.',
        [{ text: 'OK' }]
      );
    }
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

  const toggleCamera = () => {
    if (!hasPermission) {
      checkCameraPermission();
      return;
    }

    const newState = !isCameraOn;
    setIsCameraOn(newState);

    // Animate the curtain
    if (newState) {
      // Camera turning on - scroll curtain up
      curtainTranslateY.value = withTiming(-height, {
        duration: 800,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      });
    } else {
      // Camera turning off - scroll curtain down
      curtainTranslateY.value = withTiming(0, {
        duration: 800,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      });
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
      return (
        <View style={styles.closedCamera}>
          <Text style={styles.cameraOffText}>No camera device found</Text>
          <Text style={styles.cameraOffSubtext}>Please check your device</Text>
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
      <View style={[styles.cameraControlsCenter]}>
        <TouchableHighlight 
          disabled={!isCameraOn}
          style={[styles.cameraButton, styles.cameraButtonActive, !isCameraOn && styles.cameraButtonDisabled]} 
          onPress={handleTakePhoto}
        >
          <Text style={styles.cameraButtonText}>
            {isCameraOn? '' : 'Camera is Sleeping zZZ'}
          </Text>
        </TouchableHighlight>
        <TouchableHighlight
          style={[styles.cameraButton]} 
          onPress={toggleCamera}
        >
          <Text style={styles.cameraButtonText}>
            {isCameraOn ? 'Turn Off Camera' : 'Turn On Camera'}
          </Text>
        </TouchableHighlight>
      </View>
    </View>
  );
}