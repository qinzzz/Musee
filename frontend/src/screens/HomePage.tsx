import React from 'react';
import {
  Text,
  View,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { homeStyles as styles } from './styles/HomeStyles';
import { Typography, ArtworkPlaceholder } from '../components';

interface HomePageProps {
  onCapturePress: () => void;
  onGalleryPress: () => void;
  onImportFromAlbum: () => void;
}

export default function HomePage({
  onCapturePress,
  onGalleryPress,
  onImportFromAlbum,
}: HomePageProps) {
  const safeAreaInsets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: safeAreaInsets.top }]}>
      {/* Main Content Area */}
      <View style={styles.content}>
        {/* Header Section */}
        <View style={styles.headerSection}>
          <Typography variant="h1" style={styles.title}>DISCOVER</Typography>
          <Text style={styles.secondaryTitle}>Musee is... </Text>
          <Text style={[styles.normalText, {alignSelf: 'flex-end'}]}>Your personal collection / your museum guide / your art journey </Text>
        </View>

        {/* Artwork Image Placeholder */}
        <ArtworkPlaceholder onPress={onCapturePress} onImportFromAlbum={onImportFromAlbum}/>
        
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
