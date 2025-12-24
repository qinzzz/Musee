import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Dimensions,
  TouchableOpacity,
  Text,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';
import { spacing } from '../constants/theme';
import { Toast, GalleryGridItem, GalleryHeader, GalleryEmptyState } from '../components';
import { homeStyles } from './styles/HomeStyles';
import { useGallery } from '../hooks/useGallery';

const { width } = Dimensions.get('window');
const COLUMN_GAP = 12;
const PADDING = 16;
const ITEM_WIDTH = (width - PADDING * 2 - COLUMN_GAP) / 2;

export default function GalleryScreen({ navigation }: any) {
  const safeAreaInsets = useSafeAreaInsets();
  const [selectedTab, setSelectedTab] = useState<'recognized' | 'unknown'>('recognized');
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [showToast, setShowToast] = useState(false);

  const { items, isLoading, deleteItem } = useGallery(selectedTab);

  const handleConfirmDelete = async (itemId: string) => {
    const success = await deleteItem(itemId);
    if (success) {
      setDeletingItemId(null);
      setShowToast(true);
    }
  };

  const renderItem = ({ item }: { item: any }) => {
    return (
      <GalleryGridItem
        item={item}
        itemWidth={ITEM_WIDTH}
        isDeleting={deletingItemId === item.id}
        onPress={() => {
          if (deletingItemId === item.id) {
            setDeletingItemId(null);
          } else {
            const allIds = items.map(i => i.id);
            navigation.navigate('ArtworkDetail', {
              artworkId: item.id,
              initialPhotoUri: item.uri,
              initialBackgroundColor: item.backgroundColor,
              artworkIds: allIds,
            });
          }
        }}
        onLongPress={() => setDeletingItemId(item.id)}
        onConfirmDelete={() => handleConfirmDelete(item.id)}
      />
    );
  };

  return (
    <View style={[styles.container, { paddingTop: safeAreaInsets.top }]}>
      <GalleryHeader
        selectedTab={selectedTab}
        onTabChange={setSelectedTab}
      />

      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.gridContainer}
        ListEmptyComponent={<GalleryEmptyState isLoading={isLoading} />}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        initialNumToRender={10}
        windowSize={5}
        getItemLayout={(_data, index) => ({
          length: ITEM_WIDTH + spacing.base,
          offset: (ITEM_WIDTH + spacing.base) * Math.floor(index / 2),
          index,
        })}
      />

      <View style={[homeStyles.bottomNav, { paddingBottom: safeAreaInsets.bottom }]}>
        <Text style={[homeStyles.navLabel, homeStyles.navLabelActive]}>History</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Home')} activeOpacity={0.7}>
          <Text style={homeStyles.navLabel}>Discover</Text>
        </TouchableOpacity>
        <TouchableOpacity activeOpacity={0.7}>
          <Text style={homeStyles.navLabel}>Gallery</Text>
        </TouchableOpacity>
      </View>

      <Toast
        message="Deleted successfully"
        visible={showToast}
        onHide={() => setShowToast(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
  },
  gridContainer: {
    paddingHorizontal: PADDING,
    paddingBottom: 100,
  },
  row: {
    justifyContent: 'space-between',
    marginBottom: COLUMN_GAP,
  },
});
