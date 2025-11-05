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
import { Typography } from '../components';
import { homeStyles } from './styles/HomeStyles';
import { historyApiService } from '../services/historyApi';
import { historyCacheService, HistoryItem } from '../services/historyCache';

interface GalleryItem {
  id: string;
  uri: string;
  artistName: string;
  artworkName: string;
  createdAt?: string;
}

interface GalleryScreenProps {
  onBack: () => void;
  onGalleryPress: () => void;

}

const { width } = Dimensions.get('window');
const COLUMN_GAP = 12;
const PADDING = 24;
const ITEM_WIDTH = (width - PADDING * 2 - COLUMN_GAP) / 2;

export default function GalleryScreen({ onBack, onGalleryPress }: GalleryScreenProps) {
  const safeAreaInsets = useSafeAreaInsets();
  const [selectedTab, setSelectedTab] = useState<'recognized' | 'unknown'>('recognized');
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadPhotos();
  }, [selectedTab]);

  const loadPhotos = async () => {
    setIsLoading(true);
    try {
      // Try to load from cache first
      const cachedData = await historyCacheService.getFromCache();

      if (cachedData) {
        // Use cached data
        const filteredItems = filterItemsByTab(cachedData);
        setItems(convertToGalleryItems(filteredItems));
        setIsLoading(false);
        return;
      }

      // Fetch from backend if cache is empty or expired
      const recognizedOnly = selectedTab === 'recognized' ? true : selectedTab === 'unknown' ? false : undefined;
      const response = await historyApiService.getHistory({
        recognizedOnly,
        limit: 100,
      });

      // Save to cache
      await historyCacheService.saveToCache(response.items);

      // Convert and display
      setItems(convertToGalleryItems(response.items));
    } catch (error) {
      console.error('Error loading photos:', error);
      Alert.alert('Error', 'Failed to load history. Please check your connection.');
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  };

  const filterItemsByTab = (items: HistoryItem[]): HistoryItem[] => {
    if (selectedTab === 'recognized') {
      return items.filter(item => item.is_recognized === 1);
    } else if (selectedTab === 'unknown') {
      return items.filter(item => item.is_recognized === 0);
    }
    return items;
  };

  const convertToGalleryItems = (items: HistoryItem[]): GalleryItem[] => {
    return items.map(item => ({
      id: item.id,
      uri: item.photo_uri,
      artistName: item.artist_name,
      artworkName: item.artwork_name,
      createdAt: item.created_at,
    }));
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
});
