import React, { useState } from 'react';
import {
    View,
    StyleSheet,
    FlatList,
    Dimensions,
    TouchableOpacity,
    Text,
    ScrollView,
    Alert,
    Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';
import { spacing } from '../constants/theme';
import { Toast, HistoryGridItem, HistoryHeader, HistoryEmptyState, Typography } from '../components';
import { homeStyles } from './styles/HomeStyles';
import { useHistory, HistoryTab } from '../hooks/useHistory';
import { tagApiService, Tag } from '../services/tagApi';
import { collectionApiService, Collection } from '../services/collectionApi';
import { savedArtworkApiService } from '../services/savedArtworkApi';

const { width } = Dimensions.get('window');
const ITEM_WIDTH = 140; // Fixed width for horizontal items
const GRID_PADDING = spacing.xl;
const GRID_GAP = spacing.xl;

const getColumnWidth = (numCols: number) => {
    return (width - (GRID_PADDING * 2) - (GRID_GAP * (numCols - 1))) / numCols;
};

export default function HistoryScreen({ navigation }: any) {
    const safeAreaInsets = useSafeAreaInsets();
    const [selectedTab, setSelectedTab] = useState<HistoryTab>('all');
    const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
    const [showToast, setShowToast] = useState(false);
    const [toastMessage, setToastMessage] = useState('Deleted successfully');

    // Batch Selection State
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [isGridView, setIsGridView] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [showCollectionPicker, setShowCollectionPicker] = useState(false);
    const [collections, setCollections] = useState<Collection[]>([]);
    const [isBatchProcessing, setIsBatchProcessing] = useState(false);
    const [showRareTags, setShowRareTags] = useState(false);

    const {
        items,
        groupedItems,
        isLoading,
        deleteItem,
        refreshHistory,
        selectedTagId,
        setSelectedTagId,
        availableTags,
        rareTags,
    } = useHistory(selectedTab);

    const handleConfirmDelete = async (itemId: string) => {
        const success = await deleteItem(itemId);
        if (success) {
            setDeletingItemId(null);
            setToastMessage('Deleted successfully');
            setShowToast(true);
        }
    };

    // Batch Selection logic

    const toggleSelectionMode = () => {
        setIsSelectionMode(!isSelectionMode);
        setSelectedIds(new Set());
    };

    const toggleItemSelection = (itemId: string) => {
        const newSelected = new Set(selectedIds);
        if (newSelected.has(itemId)) {
            newSelected.delete(itemId);
        } else {
            newSelected.add(itemId);
        }
        setSelectedIds(newSelected);
    };

    const handleBatchDelete = async () => {
        if (selectedIds.size === 0) return;

        Alert.alert(
            'Batch Delete',
            `Are you sure you want to delete ${selectedIds.size} items?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        setIsBatchProcessing(true);
                        try {
                            const result = await savedArtworkApiService.deleteSavedArtworksBatch(Array.from(selectedIds));
                            setToastMessage(`Deleted ${result.deleted_count} items`);
                            setShowToast(true);
                            setIsSelectionMode(false);
                            setSelectedIds(new Set());
                            refreshHistory();
                        } catch (error) {
                            console.error('Batch delete failed:', error);
                            Alert.alert('Error', 'Failed to delete items in batch');
                        } finally {
                            setIsBatchProcessing(false);
                        }
                    }
                }
            ]
        );
    };

    const handleBatchAddToCollection = async () => {
        if (selectedIds.size === 0) return;

        setIsBatchProcessing(true);
        try {
            const data = await collectionApiService.getCollections();
            setCollections(data);
            setShowCollectionPicker(true);
        } catch (error) {
            console.error('Failed to fetch collections:', error);
            Alert.alert('Error', 'Failed to fetch collections');
        } finally {
            setIsBatchProcessing(false);
        }
    };

    const addSelectedToCollection = async (collectionId: string) => {
        setIsBatchProcessing(true);
        try {
            const collection = await collectionApiService.getCollection(collectionId);
            const currentIds = collection.artworks?.map(a => a.id) || [];
            const newIds = [...new Set([...currentIds, ...Array.from(selectedIds)])];

            await collectionApiService.updateCollection(collectionId, {
                artwork_ids: newIds
            });

            setToastMessage(`Added to ${collection.name}`);
            setShowToast(true);
            setShowCollectionPicker(false);
            setIsSelectionMode(false);
            setSelectedIds(new Set());
        } catch (error) {
            console.error('Failed to add to collection:', error);
            Alert.alert('Error', 'Failed to add items to collection');
        } finally {
            setIsBatchProcessing(false);
        }
    };

    const renderHistoryGroup = (group: { title: string; items: any[] }, index: number) => {
        // Generate a 3-digit prefix based on index for the high-fashion look
        const prefix = (index + 30).toString().padStart(3, '0');

        return (
            <View key={group.title} style={styles.groupContainer}>
                <View style={styles.groupHeader}>
                    <View style={styles.titleContainer}>
                        <Text style={styles.prefixText}>{prefix}</Text>
                        <Typography style={styles.groupTitle}>
                            {group.title.toUpperCase()}
                        </Typography>
                    </View>
                    {group.items.length > 4 && (
                        <TouchableOpacity
                            onPress={() => {
                                if (group.title === 'RECENTLY VIEWED') {
                                    setIsGridView(true);
                                }
                            }}
                            style={styles.arrowButton}
                        >
                            <Text style={styles.arrowText}>→</Text>
                        </TouchableOpacity>
                    )}
                </View>

                <FlatList
                    horizontal
                    data={group.items}
                    keyExtractor={(item) => item.id}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.horizontalListContent}
                    renderItem={({ item }) => (
                        <HistoryGridItem
                            item={item}
                            itemWidth={ITEM_WIDTH}
                            isDeleting={deletingItemId === item.id}
                            selectionModeActive={isSelectionMode}
                            isSelected={selectedIds.has(item.id)}
                            onPress={() => {
                                if (isSelectionMode) {
                                    toggleItemSelection(item.id);
                                } else if (deletingItemId === item.id) {
                                    setDeletingItemId(null);
                                } else {
                                    navigation.navigate('ArtworkDetail', {
                                        artworkId: item.id,
                                        initialPhotoUri: item.uri,
                                        initialBackgroundColor: item.backgroundColor,
                                        artworkItems: group.items.map((i: any) => ({
                                            id: i.id,
                                            uri: i.uri,
                                            backgroundColor: i.backgroundColor
                                        })),
                                    });
                                }
                            }}
                            onLongPress={() => {
                                if (!isSelectionMode) {
                                    setDeletingItemId(item.id);
                                }
                            }}
                            onConfirmDelete={() => handleConfirmDelete(item.id)}
                        />
                    )}
                />
            </View>
        );
    };

    return (
        <View style={[styles.container, { paddingTop: safeAreaInsets.top }]}>
            <HistoryHeader
                selectedTab={selectedTab}
                onTabChange={setSelectedTab}
                isSelectionMode={isSelectionMode}
                onToggleSelection={toggleSelectionMode}
            />

            {!isSelectionMode && (availableTags.length > 0 || rareTags.length > 0) && (
                <View style={styles.tagFilterContainer}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tagScrollContent}>
                        <TouchableOpacity
                            style={[styles.tagChip, !selectedTagId && styles.tagChipActive]}
                            onPress={() => {
                                setSelectedTagId(null);
                                setIsGridView(false);
                            }}
                        >
                            <Text style={[styles.tagText, !selectedTagId && styles.tagTextActive]}>ALL</Text>
                        </TouchableOpacity>

                        {availableTags.map((tag: Tag) => (
                            <TouchableOpacity
                                key={tag.id}
                                style={[styles.tagChip, selectedTagId === tag.id && styles.tagChipActive]}
                                onPress={() => {
                                    setSelectedTagId(tag.id);
                                    setShowRareTags(false);
                                }}
                            >
                                <Text style={[styles.tagText, selectedTagId === tag.id && styles.tagTextActive]}>{tag.name.toUpperCase()}</Text>
                            </TouchableOpacity>
                        ))}

                        {rareTags.length > 0 && (
                            <TouchableOpacity
                                style={[styles.tagChip, showRareTags && styles.tagChipActive]}
                                onPress={() => setShowRareTags(!showRareTags)}
                            >
                                <Text style={[styles.tagText, showRareTags && styles.tagTextActive]}>OTHERS {showRareTags ? '▲' : '▼'}</Text>
                            </TouchableOpacity>
                        )}
                    </ScrollView>

                    {showRareTags && rareTags.length > 0 && (
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={[styles.tagScrollContent, { marginTop: spacing.xs, borderTopWidth: 1, borderTopColor: '#F5F5F5', paddingTop: spacing.xs }]}
                        >
                            {rareTags.map((tag: Tag) => (
                                <TouchableOpacity
                                    key={tag.id}
                                    style={[styles.tagChip, selectedTagId === tag.id && styles.tagChipActive]}
                                    onPress={() => setSelectedTagId(tag.id)}
                                >
                                    <Text style={[styles.tagText, selectedTagId === tag.id && styles.tagTextActive]}>{tag.name.toUpperCase()}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    )}
                </View>
            )}

            {isLoading ? (
                <HistoryEmptyState isLoading={true} />
            ) : items.length === 0 ? (
                <HistoryEmptyState isLoading={false} />
            ) : (selectedTagId || isGridView || selectedTab === 'all' || selectedTab === 'unknown') ? (
                /* Plain Grid View for Tagged Results, Expanded View, or All/Unknown tabs */
                <FlatList
                    key={selectedTab === 'all' ? 'three-columns' : 'two-columns'}
                    data={items}
                    keyExtractor={(item) => item.id}
                    numColumns={selectedTab === 'all' ? 3 : 2}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.gridContent}
                    columnWrapperStyle={styles.gridRow}
                    renderItem={({ item }) => (
                        <HistoryGridItem
                            item={item}
                            itemWidth={getColumnWidth(selectedTab === 'all' ? 3 : 2)}
                            hideMetadata={selectedTab === 'all'}
                            isDeleting={deletingItemId === item.id}
                            selectionModeActive={isSelectionMode}
                            isSelected={selectedIds.has(item.id)}
                            onPress={() => {
                                if (isSelectionMode) {
                                    toggleItemSelection(item.id);
                                } else if (deletingItemId === item.id) {
                                    setDeletingItemId(null);
                                } else {
                                    navigation.navigate('ArtworkDetail', {
                                        artworkId: item.id,
                                        initialPhotoUri: item.uri,
                                        initialBackgroundColor: item.backgroundColor,
                                        artworkItems: items.map((i: any) => ({
                                            id: i.id,
                                            uri: i.uri,
                                            backgroundColor: i.backgroundColor
                                        })),
                                    });
                                }
                            }}
                            onLongPress={() => toggleSelectionMode()}
                            onConfirmDelete={() => handleConfirmDelete(item.id)}
                        />
                    )}
                />
            ) : (
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.scrollContent}
                >
                    {groupedItems.map((group: any, index: number) => renderHistoryGroup(group, index))}
                </ScrollView>
            )}

            {isSelectionMode && (
                <View style={[styles.batchActionBar, { bottom: safeAreaInsets.bottom + 80 }]}>
                    <TouchableOpacity
                        style={[styles.batchActionBtn, selectedIds.size === 0 && styles.batchActionBtnDisabled]}
                        onPress={handleBatchAddToCollection}
                        disabled={selectedIds.size === 0 || isBatchProcessing}
                    >
                        <Text style={styles.batchActionBtnText}>ADD TO COLLECTION</Text>
                    </TouchableOpacity>
                    <View style={styles.divider} />
                    <TouchableOpacity
                        style={[styles.batchActionBtn, selectedIds.size === 0 && styles.batchActionBtnDisabled]}
                        onPress={handleBatchDelete}
                        disabled={selectedIds.size === 0 || isBatchProcessing}
                    >
                        <Text style={[styles.batchActionBtnText, { color: colors.red || '#FF3B30' }]}>
                            DELETE ({selectedIds.size})
                        </Text>
                    </TouchableOpacity>
                </View>
            )}

            <Modal
                visible={showCollectionPicker}
                transparent={true}
                animationType="slide"
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.pickerContent}>
                        <Typography variant="h3" style={styles.pickerTitle}>SELECT COLLECTION</Typography>
                        <ScrollView style={styles.collectionList}>
                            {collections.map(col => (
                                <TouchableOpacity
                                    key={col.id}
                                    style={styles.collectionItem}
                                    onPress={() => addSelectedToCollection(col.id)}
                                >
                                    <Text style={styles.collectionName}>{col.name}</Text>
                                    <Text style={styles.collectionCount}>{col.artwork_count} items</Text>
                                </TouchableOpacity>
                            ))}
                            {collections.length === 0 && (
                                <Text style={styles.emptyPickerText}>No collections found</Text>
                            )}
                        </ScrollView>
                        <TouchableOpacity
                            style={styles.closePickerBtn}
                            onPress={() => setShowCollectionPicker(false)}
                        >
                            <Text style={styles.closePickerBtnText}>CLOSE</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <View style={[homeStyles.bottomNav, { paddingBottom: safeAreaInsets.bottom }]}>
                <Text style={[homeStyles.navLabel, homeStyles.navLabelActive]}>History</Text>
                <TouchableOpacity onPress={() => navigation.navigate('Home')} activeOpacity={0.7}>
                    <Text style={homeStyles.navLabel}>Discover</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => navigation.navigate('Collections')} activeOpacity={0.7}>
                    <Text style={homeStyles.navLabel}>Gallery</Text>
                </TouchableOpacity>
            </View>

            <Toast
                message={toastMessage}
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
    scrollContent: {
        paddingTop: spacing.base,
        paddingBottom: 100, // Space for bottom nav
    },
    groupContainer: {
        marginBottom: spacing['2xl'],
    },
    groupHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: spacing.xl,
        marginBottom: spacing.base,
    },
    titleContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    prefixText: {
        fontFamily: 'PP Neue Montreal Book',
        fontSize: 10,
        color: colors.black,
        marginTop: 1,
    },
    groupTitle: {
        fontFamily: 'PP Neue Montreal',
        fontSize: 14,
        fontWeight: '500',
        color: colors.black,
        letterSpacing: 0.5,
    },
    arrowButton: {
        padding: spacing.xs,
    },
    arrowText: {
        fontSize: 20,
        color: colors.black,
        fontWeight: '300',
    },
    horizontalListContent: {
        paddingHorizontal: spacing.xl,
        gap: spacing.base,
    },
    // Batch Selection Styles
    batchActionBar: {
        position: 'absolute',
        left: spacing.xl,
        right: spacing.xl,
        backgroundColor: colors.white,
        borderRadius: 40,
        flexDirection: 'row',
        height: 60,
        alignItems: 'center',
        paddingHorizontal: spacing.base,
        // Fancy shadow
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 8,
        borderWidth: 1,
        borderColor: '#EEEEEE',
    },
    batchActionBtn: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
    },
    batchActionBtnDisabled: {
        opacity: 0.3,
    },
    batchActionBtnText: {
        fontFamily: 'PP Neue Montreal',
        fontSize: 11,
        fontWeight: '600',
        letterSpacing: 0.5,
        color: colors.black,
    },
    divider: {
        width: 1,
        height: 20,
        backgroundColor: '#EEEEEE',
    },
    // Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'flex-end',
    },
    pickerContent: {
        backgroundColor: colors.white,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: spacing.xl,
        maxHeight: '80%',
    },
    pickerTitle: {
        marginBottom: spacing.xl,
        textAlign: 'center',
        fontSize: 18,
    },
    collectionList: {
        marginBottom: spacing.xl,
    },
    collectionItem: {
        paddingVertical: spacing.lg,
        borderBottomWidth: 1,
        borderBottomColor: '#F5F5F5',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    collectionName: {
        fontFamily: 'PP Neue Montreal',
        fontSize: 16,
        color: colors.black,
    },
    collectionCount: {
        fontFamily: 'PP Neue Montreal Book',
        fontSize: 12,
        color: colors.midGrey,
    },
    emptyPickerText: {
        textAlign: 'center',
        color: colors.midGrey,
        marginVertical: 40,
    },
    closePickerBtn: {
        paddingVertical: spacing.base,
        alignItems: 'center',
        backgroundColor: '#F5F5F5',
        borderRadius: 12,
        marginBottom: spacing.base,
    },
    closePickerBtnText: {
        fontFamily: 'PP Neue Montreal',
        fontSize: 14,
        fontWeight: '600',
        color: colors.black,
    },
    // Tag Filter Styles
    tagFilterContainer: {
        paddingVertical: spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: '#F5F5F5',
    },
    tagScrollContent: {
        paddingHorizontal: spacing.xl,
        gap: spacing.sm,
    },
    tagChip: {
        paddingHorizontal: spacing.base,
        paddingVertical: 6,
        borderRadius: 20,
        backgroundColor: '#F5F5F5',
        borderWidth: 1,
        borderColor: '#EEEEEE',
    },
    tagChipActive: {
        backgroundColor: colors.black,
        borderColor: colors.black,
    },
    tagText: {
        fontSize: 10,
        fontFamily: 'PP Neue Montreal',
        fontWeight: '600',
        color: colors.darkGrey, // Changed from midGrey for better visibility
        letterSpacing: 0.5,
    },
    tagTextActive: {
        color: colors.white,
    },
    gridContent: {
        paddingHorizontal: spacing.xl,
        paddingTop: spacing.base,
        paddingBottom: 100,
    },
    gridRow: {
        justifyContent: 'space-between',
        marginBottom: spacing.xl,
    },
});
