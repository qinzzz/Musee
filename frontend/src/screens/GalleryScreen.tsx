import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  Dimensions,
  Text,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraRoll } from '@react-native-camera-roll/camera-roll';
import { colors } from '../constants/colors';
import { spacing, borderRadius } from '../constants/theme';
import { Typography } from '../components';

interface GalleryItem {
  id: string;
  uri: string;
  artistName: string;
  artworkName: string;
}

interface GalleryScreenProps {
  onBack: () => void;
}

const { width } = Dimensions.get('window');
const COLUMN_GAP = 12;
const PADDING = 24;
const ITEM_WIDTH = (width - PADDING * 2 - COLUMN_GAP) / 2;

export default function GalleryScreen({ onBack }: GalleryScreenProps) {
  const safeAreaInsets = useSafeAreaInsets();
  const [selectedTab, setSelectedTab] = useState<'recognized' | 'unknown'>('recognized');
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadPhotos();
  }, []);

  const loadPhotos = async () => {
    setIsLoading(true);
    try {
      // First, get all albums to find the Musee album
      const albums = await CameraRoll.getAlbums({
        assetType: 'Photos',
      });

      // Find the Musee album
      const museeAlbum = albums.find(
        album => album.title.toLowerCase() === 'musee'
      );

      if (!museeAlbum) {
        console.log('Musee album not found');
        setItems([]);
        setIsLoading(false);
        return;
      }

      // Get photos from the Musee album
      const result = await CameraRoll.getPhotos({
        first: 10,
        assetType: 'Photos',
        groupName: 'Musee',
        groupTypes: 'Album',
      });

      const galleryItems: GalleryItem[] = result.edges.map((edge, index) => ({
        id: edge.node.id || `photo-${index}`,
        uri: edge.node.image.uri,
        artistName: 'Unknown', // TODO: Extract from metadata if available
        artworkName: 'Untitled', // TODO: Extract from metadata if available
      }));

      setItems(galleryItems);
    } catch (error) {
      console.error('Error loading photos:', error);
      Alert.alert('Error', 'Failed to load photos from Musee album');
    } finally {
      setIsLoading(false);
    }
  };

  const renderItem = ({ item }: { item: GalleryItem }) => (
    <TouchableOpacity style={styles.gridItem} activeOpacity={0.8}>
      <View style={styles.imageContainer}>
        <Image
          source={{ uri: item.uri }}
          style={styles.itemImage}
          resizeMode="cover"
        />
      </View>
      <Text style={styles.itemText} numberOfLines={2}>
        {item.artworkName} by {item.artistName}
      </Text>
    </TouchableOpacity>
  );

  const renderEmpty = () => {
    if (isLoading) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color={colors.black} />
          <Text style={styles.loadingText}>Loading your collection...</Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No saved artworks yet</Text>
        <Text style={styles.emptySubtext}>
          Start scanning artworks to build your collection
        </Text>
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: safeAreaInsets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Typography variant="h1" style={styles.title}>HISTORY</Typography>
        <View style={styles.tabContainer}>
          <TouchableOpacity
            onPress={() => setSelectedTab('recognized')}
            activeOpacity={0.7}
          >
            <Text style={[
              styles.tabText,
              selectedTab === 'recognized' && styles.tabTextActive
            ]}>
              Recognized
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setSelectedTab('unknown')}
            activeOpacity={0.7}
          >
            <Text style={[
              styles.tabText,
              selectedTab === 'unknown' && styles.tabTextActive
            ]}>
              Unknown
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Grid */}
      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.gridContainer}
        ListEmptyComponent={renderEmpty}
        showsVerticalScrollIndicator={false}
      />

      {/* Bottom Navigation Placeholder */}
      <View style={styles.bottomNav}>
        <TouchableOpacity onPress={onBack} activeOpacity={0.7}>
          <Text style={[styles.navText, styles.navTextActive]}>History</Text>
        </TouchableOpacity>
        <Text style={styles.navText}>Discover</Text>
        <Text style={styles.navText}>Gallery</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
  },
  header: {
    paddingHorizontal: PADDING,
    paddingTop: spacing.xl,
    paddingBottom: spacing.base,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.black,
    letterSpacing: 0.52,
    lineHeight: 27.463,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  tabContainer: {
    flexDirection: 'row',
    gap: 1,
  },
  tabText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#6D6D6D',
    letterSpacing: 0.32,
    lineHeight: 27.463,
    textTransform: 'capitalize',
    marginRight: spacing.lg,
  },
  tabTextActive: {
    color: colors.black,
  },
  gridContainer: {
    paddingHorizontal: PADDING,
    paddingBottom: 100,
  },
  row: {
    justifyContent: 'space-between',
    marginBottom: COLUMN_GAP,
  },
  gridItem: {
    width: ITEM_WIDTH,
    marginBottom: spacing.base,
  },
  imageContainer: {
    width: '100%',
    aspectRatio: 0.75,
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
    marginBottom: spacing.xs,
    backgroundColor: colors.lightGrey,
  },
  itemImage: {
    width: '100%',
    height: '100%',
  },
  itemText: {
    fontSize: 9,
    fontWeight: '600',
    color: colors.black,
    letterSpacing: 0.18,
    lineHeight: 16,
    textTransform: 'lowercase',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: spacing['6xl'],
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.black,
    marginBottom: spacing.sm,
  },
  emptySubtext: {
    fontSize: 14,
    fontWeight: '400',
    color: '#6D6D6D',
    textAlign: 'center',
  },
  loadingText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#6D6D6D',
    marginTop: spacing.base,
  },
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 98,
    backgroundColor: colors.white,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: spacing['3xl'],
  },
  navText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#6D6D6D',
    letterSpacing: 0.32,
    lineHeight: 27.463,
    textTransform: 'capitalize',
    textAlign: 'center',
  },
  navTextActive: {
    color: colors.black,
  },
});
