import React from 'react';
import {
  Text,
  View,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { homeStyles as styles } from './styles/HomeStyles';
import Svg, { Path, Circle } from 'react-native-svg';
import { Typography } from '../components';

interface HomePageProps {
  onCapturePress: () => void;
  onGalleryPress: () => void;
}

// Camera Icon Component
const CameraIcon = () => (
  <Svg width="44" height="44" viewBox="0 0 24 24" fill="none">
    <Path
      d="M12 17C14.2091 17 16 15.2091 16 13C16 10.7909 14.2091 9 12 9C9.79086 9 8 10.7909 8 13C8 15.2091 9.79086 17 12 17Z"
      stroke="white"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M3 7V17C3 18.1046 3.89543 19 5 19H19C20.1046 19 21 18.1046 21 17V7C21 5.89543 20.1046 5 19 5H16L15 3H9L8 5H5C3.89543 5 3 5.89543 3 7Z"
      stroke="white"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export default function HomePage({
  onCapturePress,
  onGalleryPress,
}: HomePageProps) {
  const safeAreaInsets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: safeAreaInsets.top }]}>
      {/* Main Content Area */}
      <View style={styles.content}>
        {/* Header Section */}
        <View style={styles.headerSection}>
          <Typography variant="h1" style={styles.title}>DISCOVER</Typography>
          <Text style={styles.secondaryTitle}>Museum name</Text>
          <Text style={styles.normalText}>location</Text>
        </View>

        {/* Artwork Image Placeholder */}
        <View style={styles.artworkImagePlaceholder} />

        {/* Camera Button - Positioned above bottom nav */}
        <View style={styles.cameraButtonContainer}>
          <TouchableOpacity
            style={styles.floatingCameraButton}
            onPress={onCapturePress}
            activeOpacity={0.8}
          >
            <CameraIcon />
          </TouchableOpacity>
        </View>
      </View>

      {/* Bottom Navigation Bar */}
      <View style={[styles.bottomNav, { paddingBottom: safeAreaInsets.bottom }]}>
        {/* History Button */}
        <TouchableOpacity
          style={styles.navButton}
          onPress={onGalleryPress}
        >
          <Text style={styles.navLabel}>History</Text>
        </TouchableOpacity>

        {/* Discover Button (Active) */}
        <TouchableOpacity
          style={styles.navButton}
        >
          <Text style={styles.navLabelActive}>Discover</Text>
        </TouchableOpacity>

        {/* Gallery Button */}
        <TouchableOpacity
          style={styles.navButton}
          onPress={onGalleryPress}
        >
          <Text style={styles.navLabel}>Gallery</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
