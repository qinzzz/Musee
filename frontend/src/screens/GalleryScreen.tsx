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
import { colors } from '../constants/colors';
import { spacing, borderRadius } from '../constants/theme';
import { Typography, Toast } from '../components';
import { homeStyles } from './styles/HomeStyles';
import { savedArtworkApiService, SavedArtwork } from '../services/savedArtworkApi';
import { historyCacheService } from '../services/historyCache';

interface GalleryItem {
  id: string;
  uri: string;
  artistName: string;
  artworkName: string;
  createdAt?: string;
  backgroundColor?: string;
}

interface GalleryScreenProps {
  onBack: () => void;
  onGalleryPress: () => void;
  onArtworkPress?: (artworkId: string, photoUri: string, backgroundColor?: string) => void;
}

const { width } = Dimensions.get('window');
const COLUMN_GAP = 12;
const PADDING = 24;
const ITEM_WIDTH = (width - PADDING * 2 - COLUMN_GAP) / 2;

export default function GalleryScreen({ onBack, onGalleryPress, onArtworkPress }: GalleryScreenProps) {
  const safeAreaInsets = useSafeAreaInsets();
  const [selectedTab, setSelectedTab] = useState<'recognized' | 'unknown'>('recognized');
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [showToast, setShowToast] = useState(false);

  useEffect(() => {
    loadPhotos();
  }, [selectedTab]);

  const loadPhotos = async () => {
    setIsLoading(true);
    try {
      // Try to load from cache first
      const cachedData = await historyCacheService.getFromCache();

      if (cachedData) {
        // Filter cached data based on selectedTab
        const filteredData = selectedTab === 'recognized'
          ? cachedData.filter(item => item.is_recognized === 1)
          : selectedTab === 'unknown'
          ? cachedData.filter(item => item.is_recognized === 0)
          : cachedData;

        const convertedItems = filteredData.map(item => ({
          id: item.id,
          uri: item.photo_uri,
          artistName: item.artist_name,
          artworkName: item.artwork_name,
          createdAt: item.created_at,
          backgroundColor: item.background_color,
        }));

        setItems(convertedItems);
        setIsLoading(false);

        // Optionally refresh in background
        refreshDataInBackground();
        return;
      }

      // No cache or expired - fetch from backend
      await fetchFromBackend();
    } catch (error) {
      console.error('Error loading photos:', error);
      Alert.alert('Error', 'Failed to load saved artworks. Please check your connection.');
      setItems([]);
      setIsLoading(false);
    }
  };

  const fetchFromBackend = async () => {
    try {
      const recognizedOnly = selectedTab === 'recognized' ? true : selectedTab === 'unknown' ? false : undefined;
      const response = await savedArtworkApiService.getSavedArtworks({
        recognizedOnly,
        limit: 100,
      });

      // Save to cache (save all items, not just filtered)
      await historyCacheService.saveToCache(response.items);

      // Convert and display
      setItems(convertToGalleryItems(response.items));
    } finally {
      setIsLoading(false);
    }
  };

  const refreshDataInBackground = async () => {
    // Silently refresh data in background without showing loading indicator
    try {
      const recognizedOnly = selectedTab === 'recognized' ? true : selectedTab === 'unknown' ? false : undefined;
      const response = await savedArtworkApiService.getSavedArtworks({
        recognizedOnly,
        limit: 100,
      });

      // Update cache
      await historyCacheService.saveToCache(response.items);

      // Update UI if data has changed
      const newItems = convertToGalleryItems(response.items);
      setItems(newItems);
    } catch (error) {
      // Silently fail - user already has cached data
      console.log('Background refresh failed:', error);
    }
  };

  const convertToGalleryItems = (items: SavedArtwork[]): GalleryItem[] => {
    return items.map(item => ({
      id: item.id,
      uri: item.photo_uri,
      artistName: item.artist_name,
      artworkName: item.artwork_name,
      createdAt: item.created_at,
      backgroundColor: item.background_color,
    }));
  };

  const handleLongPress = (itemId: string) => {
    setDeletingItemId(itemId);
  };

  const handleCancelDelete = () => {
    setDeletingItemId(null);
  };

  const handleConfirmDelete = async (itemId: string) => {
    try {
      // Delete from database (does not delete the photo from album)
      await savedArtworkApiService.deleteSavedArtwork(itemId);

      // Remove from local state
      setItems(prevItems => prevItems.filter(item => item.id !== itemId));
      setDeletingItemId(null);

      // Show toast message
      setShowToast(true);
    } catch (error) {
      console.error('Error deleting artwork:', error);
      Alert.alert('Error', 'Failed to delete artwork. Please try again.');
      setDeletingItemId(null);
    }
  };

  const handleToastHide = () => {
    setShowToast(false);
  };

  const renderItem = ({ item }: { item: GalleryItem }) => {
    const isDeleting = deletingItemId === item.id;

    return (
      <TouchableOpacity
        style={styles.gridItem}
        activeOpacity={0.8}
        onPress={() => {
          if (isDeleting) {
            handleCancelDelete();
          } else {
            onArtworkPress?.(item.id, item.uri, item.backgroundColor);
          }
        }}
        onLongPress={() => handleLongPress(item.id)}
        delayLongPress={500}
      >
        <View style={styles.imageContainer}>
          <Image
            source={{ uri: item.uri }}
            style={styles.itemImage}
            resizeMode="cover"
          />
          {isDeleting && (
            <View style={styles.deleteOverlay}>
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => handleConfirmDelete(item.id)}
                activeOpacity={0.8}
              >
                <Text style={styles.deleteText}>Delete</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
        <Text style={styles.itemText} numberOfLines={2}>
          {item.artworkName} by {item.artistName}
        </Text>
      </TouchableOpacity>
    );
  };

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
      <View style={homeStyles.headerSection}>
        <Typography variant="h1" style={homeStyles.title}>HISTORY</Typography>
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
        // Performance optimizations
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={50}
        initialNumToRender={10}
        windowSize={5}
        getItemLayout={(_data, index) => ({
          length: ITEM_WIDTH + spacing.base,
          offset: (ITEM_WIDTH + spacing.base) * Math.floor(index / 2),
          index,
        })}
      />

      {/* Bottom Navigation Placeholder */}
      <View style={[homeStyles.bottomNav, { paddingBottom: safeAreaInsets.bottom }]}>
          <Text style={[homeStyles.navLabel, homeStyles.navLabelActive]}>History</Text>
        <TouchableOpacity onPress={onBack} activeOpacity={0.7}>
          <Text style={homeStyles.navLabel}>Discover</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onGalleryPress} activeOpacity={0.7}>
          <Text style={homeStyles.navLabel}>Gallery</Text>
        </TouchableOpacity>
      </View>

      {/* Toast */}
      <Toast
        message="Deleted successfully"
        visible={showToast}
        onHide={handleToastHide}
      />
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
  tabContainer: {
    flexDirection: 'row',
    gap: 1,
  },
  tabText: {
    fontSize: 16,
    fontFamily: 'PP Neue Montreal',
    fontWeight: '500',
    color: '#6D6D6D',
    letterSpacing: 0.32,
    lineHeight: 25,
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
  deleteOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: borderRadius.sm,
  },
  deleteButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  deleteText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF3B30',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
