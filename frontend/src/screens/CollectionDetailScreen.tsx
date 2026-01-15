import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    StyleSheet,
    FlatList,
    Dimensions,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
    Modal,
    Image,
    TextInput
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';
import { spacing, shadows, borderRadius } from '../constants/theme';
import { Typography, HistoryGridItem, ArrowIcon, Toast, LoadingProgressBar } from '../components';
import { collectionApiService, Collection } from '../services/collectionApi';
import { useHistory } from '../hooks/useHistory';

const { width } = Dimensions.get('window');
const COLUMN_GAP = 12;
const PADDING = 16;
const ITEM_WIDTH = (width - PADDING * 2 - COLUMN_GAP) / 2;

export default function CollectionDetailScreen({ route, navigation }: any) {
    const { collectionId, collectionName } = route.params;
    const safeAreaInsets = useSafeAreaInsets();
    const [collection, setCollection] = useState<Collection | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
    const [showToast, setShowToast] = useState(false);
    const [toastMessage, setToastMessage] = useState('');

    // Selection Modal State
    const [isSelecting, setIsSelecting] = useState(false);
    const [selectedArtworkIds, setSelectedArtworkIds] = useState<string[]>([]);
    const [isSaving, setIsSaving] = useState(false);

    const { items: allArtworks, isLoading: isLoadingArtworks } = useHistory('recognized');

    const fetchCollectionDetails = useCallback(async () => {
        setIsLoading(true);
        try {
            const data = await collectionApiService.getCollection(collectionId);
            setCollection(data);
        } catch (error) {
            console.error('Failed to fetch collection details:', error);
            Alert.alert('Error', 'Failed to load collection details.');
        } finally {
            setIsLoading(false);
        }
    }, [collectionId]);

    useEffect(() => {
        fetchCollectionDetails();
    }, [fetchCollectionDetails]);

    const handleRemoveFromCollection = async (artworkId: string) => {
        try {
            await collectionApiService.removeArtworkFromCollection(collectionId, artworkId);
            setDeletingItemId(null);
            setToastMessage('Removed from collection');
            setShowToast(true);
            fetchCollectionDetails(); // Refresh list
        } catch (error) {
            console.error('Failed to remove artwork from collection:', error);
            Alert.alert('Error', 'Failed to remove artwork from collection.');
        }
    };

    const handleOpenSelection = () => {
        const currentIds = collection?.artworks?.map(a => a.id) || [];
        setSelectedArtworkIds(currentIds);
        setIsSelecting(true);
    };

    const handleSaveArtworks = async () => {
        setIsSaving(true);
        try {
            await collectionApiService.updateCollection(collectionId, {
                artwork_ids: selectedArtworkIds
            });
            setIsSelecting(false);
            setToastMessage('Collection updated');
            setShowToast(true);
            fetchCollectionDetails();
        } catch (error) {
            console.error('Failed to update collection:', error);
            Alert.alert('Error', 'Failed to update collection.');
        } finally {
            setIsSaving(false);
        }
    };

    const toggleArtworkSelection = (id: string) => {
        setSelectedArtworkIds(prev =>
            prev.includes(id)
                ? prev.filter(item => item !== id)
                : [...prev, id]
        );
    };

    const renderItem = ({ item }: { item: any }) => {
        return (
            <HistoryGridItem
                item={{
                    id: item.id,
                    uri: item.photo_uri,
                    artistName: item.artist_name,
                    artworkName: item.artwork_name,
                    backgroundColor: item.background_color,
                    isRecognized: item.is_recognized === 1 || item.is_recognized === true,
                }}
                itemWidth={ITEM_WIDTH}
                isDeleting={deletingItemId === item.id}
                onPress={() => {
                    if (deletingItemId === item.id) {
                        setDeletingItemId(null);
                    } else {
                        const allIds = collection?.artworks?.map(i => i.id) || [];
                        navigation.navigate('ArtworkDetail', {
                            artworkId: item.id,
                            initialPhotoUri: item.photo_uri,
                            initialBackgroundColor: item.background_color,
                            artworkIds: allIds,
                        });
                    }
                }}
                onLongPress={() => setDeletingItemId(item.id)}
                onConfirmDelete={() => handleRemoveFromCollection(item.id)}
            />
        );
    };

    return (
        <View style={[styles.container, { paddingTop: safeAreaInsets.top }]}>
            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => navigation.goBack()}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                    <ArrowIcon size={24} color={colors.black} direction="left" />
                </TouchableOpacity>
                <View style={styles.titleContainer}>
                    <Typography variant="h0" style={styles.title}>
                        {(collection?.name || collectionName).toUpperCase()}
                    </Typography>
                </View>
                <TouchableOpacity
                    style={styles.addButton}
                    onPress={handleOpenSelection}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                    <Typography variant="h2" style={styles.addButtonText}>+</Typography>
                </TouchableOpacity>
            </View>

            {isLoading ? (
                <View style={styles.loaderContainer}>
                    <ActivityIndicator size="large" color={colors.black} />
                </View>
            ) : (
                <FlatList
                    data={collection?.artworks || []}
                    renderItem={renderItem}
                    keyExtractor={(item) => item.id}
                    numColumns={2}
                    columnWrapperStyle={styles.row}
                    contentContainerStyle={styles.gridContainer}
                    ListEmptyComponent={() => (
                        <View style={styles.emptyContainer}>
                            <Typography style={styles.emptyText}>No artworks in this collection yet.</Typography>
                        </View>
                    )}
                    showsVerticalScrollIndicator={false}
                />
            )}

            <Toast
                message={toastMessage}
                visible={showToast}
                onHide={() => setShowToast(false)}
            />

            {/* Selection Modal */}
            <Modal
                visible={isSelecting}
                animationType="slide"
                transparent={false}
            >
                <View style={[styles.modalContainer, { paddingTop: safeAreaInsets.top + spacing.lg }]}>
                    <View style={styles.modalHeader}>
                        <TouchableOpacity onPress={() => setIsSelecting(false)}>
                            <Typography variant="label" style={styles.cancelText}>Cancel</Typography>
                        </TouchableOpacity>
                        <Typography variant="h2" style={styles.modalTitle}>Manage Artworks</Typography>
                        <TouchableOpacity onPress={handleSaveArtworks} disabled={isSaving}>
                            <Typography
                                variant="label"
                                style={{
                                    ...styles.saveText,
                                    ...(isSaving ? styles.disabledText : {})
                                }}
                            >
                                {isSaving ? 'Saving...' : 'Save'}
                            </Typography>
                        </TouchableOpacity>
                    </View>

                    <Typography variant="h3" style={styles.selectionTitle}>Select Artworks</Typography>

                    {isLoadingArtworks ? (
                        <View style={styles.loaderContainer}>
                            <LoadingProgressBar />
                        </View>
                    ) : (
                        <FlatList
                            data={allArtworks}
                            numColumns={3}
                            keyExtractor={item => item.id}
                            contentContainerStyle={styles.artworkGrid}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    style={[
                                        styles.artworkThumbnail,
                                        selectedArtworkIds.includes(item.id) && styles.selectedArtwork
                                    ]}
                                    onPress={() => toggleArtworkSelection(item.id)}
                                    activeOpacity={0.7}
                                >
                                    <Image source={{ uri: item.uri }} style={styles.artworkImage} />
                                    {selectedArtworkIds.includes(item.id) && (
                                        <View style={styles.checkOverlay}>
                                            <Typography style={styles.checkIcon}>✓</Typography>
                                        </View>
                                    )}
                                </TouchableOpacity>
                            )}
                        />
                    )}
                </View>
            </Modal>
        </View>
    );
}

const GRID_PADDING = spacing.base;
const ARTWORK_SIZE = (width - (GRID_PADDING * 4)) / 3;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.white,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.base,
        borderBottomWidth: 1,
        borderBottomColor: colors.lightGrey,
    },
    backButton: {
        padding: spacing.sm,
    },
    addButton: {
        width: 44,
        alignItems: 'flex-end',
        paddingRight: spacing.sm,
    },
    addButtonText: {
        fontSize: 32,
        fontWeight: '300',
        color: colors.black,
    },
    titleContainer: {
        flex: 1,
        alignItems: 'center',
        paddingHorizontal: spacing.sm,
    },
    title: {
        fontSize: 18,
        color: colors.black,
        textAlign: 'center',
    },
    description: {
        color: colors.darkGrey,
        marginTop: 2,
        textAlign: 'center',
    },
    gridContainer: {
        paddingHorizontal: PADDING,
        paddingVertical: spacing.lg,
    },
    row: {
        justifyContent: 'space-between',
        marginBottom: COLUMN_GAP,
    },
    loaderContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 100,
    },
    emptyText: {
        color: colors.darkGrey,
        fontFamily: 'PP Neue Montreal Book',
    },
    // Modal Styles
    modalContainer: {
        flex: 1,
        backgroundColor: colors.white,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: spacing.xl,
        marginBottom: spacing.xl,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: '600',
    },
    cancelText: {
        color: colors.darkGrey,
    },
    saveText: {
        color: colors.black,
        fontWeight: '600',
    },
    disabledText: {
        color: colors.midGrey,
    },
    selectionTitle: {
        paddingHorizontal: spacing.xl,
        marginBottom: spacing.base,
        color: colors.darkGrey,
    },
    artworkGrid: {
        paddingHorizontal: GRID_PADDING,
        paddingBottom: spacing.xl,
    },
    artworkThumbnail: {
        width: ARTWORK_SIZE,
        height: ARTWORK_SIZE,
        margin: GRID_PADDING / 2,
        borderRadius: borderRadius.md,
        overflow: 'hidden',
        backgroundColor: colors.lightGrey,
    },
    artworkImage: {
        width: '100%',
        height: '100%',
    },
    selectedArtwork: {
        borderWidth: 3,
        borderColor: colors.black,
    },
    checkOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.3)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    checkIcon: {
        color: colors.white,
        fontSize: 24,
        fontWeight: 'bold',
    }
});
