import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, TextInput, FlatList, Image, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';
import { spacing, borderRadius, shadows } from '../constants/theme';
import { Typography, LoadingProgressBar } from '../components';
import { collectionApiService, Collection } from '../services/collectionApi';
import { useGallery } from '../hooks/useGallery';

export default function CollectionsScreen({ navigation }: any) {
    const safeAreaInsets = useSafeAreaInsets();
    const [collections, setCollections] = useState<Collection[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Creation State
    const [isCreating, setIsCreating] = useState(false);
    const [newCollectionName, setNewCollectionName] = useState('');
    const [selectedArtworkIds, setSelectedArtworkIds] = useState<string[]>([]);
    const [isSaving, setIsSaving] = useState(false);

    const { items: allArtworks, isLoading: isLoadingArtworks } = useGallery('recognized');

    useEffect(() => {
        loadCollections();
    }, []);

    const loadCollections = async () => {
        setIsLoading(true);
        try {
            const data = await collectionApiService.getCollections();
            setCollections(data);
        } catch (error) {
            console.error('Failed to load collections:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateCollection = () => {
        setIsCreating(true);
        setNewCollectionName('');
        setSelectedArtworkIds([]);
    };

    const handleSaveCollection = async () => {
        if (!newCollectionName.trim()) return;

        setIsSaving(true);
        try {
            await collectionApiService.createCollection({
                name: newCollectionName,
                artwork_ids: selectedArtworkIds
            });
            setIsCreating(false);
            loadCollections();
        } catch (error) {
            console.error('Failed to save collection:', error);
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

    const renderEmptyState = () => (
        <View style={styles.emptyStateContainer}>
            <Text style={styles.emptyStateIcon}>🎨</Text>
            <Typography variant="h2" style={styles.emptyStateTitle}>
                Create Your Collections
            </Typography>
            <Text style={styles.emptyStateDescription}>
                Organize your favorite artworks into collections, just like Pinterest boards
            </Text>
            <TouchableOpacity
                style={styles.createButton}
                onPress={handleCreateCollection}
                activeOpacity={0.8}
            >
                <Text style={styles.createButtonText}>Create Your First Collection</Text>
            </TouchableOpacity>
        </View>
    );

    const renderCollections = () => (
        <ScrollView
            style={styles.collectionsContainer}
            contentContainerStyle={styles.collectionsContent}
            showsVerticalScrollIndicator={false}
        >
            {collections.map((collection) => (
                <TouchableOpacity
                    key={collection.id}
                    style={styles.collectionCard}
                    onPress={() => {
                        navigation.navigate('Gallery', { collectionId: collection.id });
                    }}
                    activeOpacity={0.8}
                >
                    <View style={styles.collectionCover}>
                        <Text style={styles.collectionCoverPlaceholder}>📚</Text>
                    </View>
                    <View style={styles.collectionInfo}>
                        <Text style={styles.collectionName}>{collection.name}</Text>
                        <Text style={styles.collectionCount}>
                            {collection.artwork_count} {collection.artwork_count === 1 ? 'artwork' : 'artworks'}
                        </Text>
                    </View>
                </TouchableOpacity>
            ))}
        </ScrollView>
    );

    return (
        <View style={[styles.container, { paddingTop: safeAreaInsets.top }]}>
            <View style={styles.header}>
                <Typography variant="h1" style={styles.title}>
                    COLLECTIONS
                </Typography>
                {(collections.length > 0 || isCreating) && (
                    <TouchableOpacity
                        style={styles.addButton}
                        onPress={handleCreateCollection}
                        activeOpacity={0.8}
                    >
                        <Text style={styles.addButtonText}>+</Text>
                    </TouchableOpacity>
                )}
            </View>

            {isLoading ? (
                <View style={styles.loaderContainer}>
                    <LoadingProgressBar />
                </View>
            ) : collections.length === 0 ? renderEmptyState() : renderCollections()}

            {/* Creation Modal */}
            <Modal
                visible={isCreating}
                animationType="slide"
                transparent={false}
            >
                <View style={[styles.modalContainer, { paddingTop: safeAreaInsets.top + spacing.lg }]}>
                    <View style={styles.modalHeader}>
                        <TouchableOpacity onPress={() => setIsCreating(false)}>
                            <Typography variant="label" style={styles.cancelText}>Cancel</Typography>
                        </TouchableOpacity>
                        <Typography variant="h2" style={styles.modalTitle}>New Collection</Typography>
                        <TouchableOpacity onPress={handleSaveCollection} disabled={!newCollectionName.trim() || isSaving}>
                            <Typography
                                variant="label"
                                style={{
                                    ...styles.saveText,
                                    ...((!newCollectionName.trim() || isSaving) ? styles.disabledText : {})
                                }}
                            >
                                {isSaving ? 'Saving...' : 'Save'}
                            </Typography>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.inputContainer}>
                        <TextInput
                            style={styles.nameInput}
                            placeholder="Collection Name"
                            value={newCollectionName}
                            onChangeText={setNewCollectionName}
                            autoFocus
                        />
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
                                            <Text style={styles.checkIcon}>✓</Text>
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

const { width } = Dimensions.get('window');
const GRID_PADDING = spacing.base;
const ARTWORK_SIZE = (width - (GRID_PADDING * 4)) / 3;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.lightGrey,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: spacing.xl,
        paddingVertical: spacing.lg,
    },
    title: {
        fontFamily: 'PP Neue Montreal',
        fontWeight: '500',
        color: colors.black,
        textTransform: 'uppercase',
    },
    addButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: colors.black,
        justifyContent: 'center',
        alignItems: 'center',
        ...shadows.sm,
    },
    addButtonText: {
        fontSize: 24,
        color: colors.white,
        fontWeight: '300',
    },
    emptyStateContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: spacing['2xl'],
    },
    emptyStateIcon: {
        fontSize: 80,
        marginBottom: spacing.xl,
    },
    emptyStateTitle: {
        fontSize: 24,
        fontWeight: '600',
        color: colors.black,
        marginBottom: spacing.base,
        textAlign: 'center',
    },
    emptyStateDescription: {
        fontFamily: 'PP Neue Montreal',
        fontSize: 16,
        color: colors.darkGrey,
        textAlign: 'center',
        marginBottom: spacing['2xl'],
        lineHeight: 24,
    },
    createButton: {
        paddingVertical: spacing.base,
        paddingHorizontal: spacing['2xl'],
        backgroundColor: colors.black,
        borderRadius: borderRadius.lg,
        ...shadows.md,
    },
    createButtonText: {
        fontFamily: 'PP Neue Montreal',
        fontSize: 16,
        fontWeight: '500',
        color: colors.white,
    },
    collectionsContainer: {
        flex: 1,
    },
    collectionsContent: {
        paddingHorizontal: spacing.xl,
        paddingBottom: spacing['2xl'],
        gap: spacing.base,
    },
    collectionCard: {
        flexDirection: 'row',
        backgroundColor: colors.white,
        borderRadius: borderRadius.lg,
        padding: spacing.base,
        ...shadows.sm,
    },
    collectionCover: {
        width: 80,
        height: 80,
        borderRadius: borderRadius.md,
        backgroundColor: colors.background,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: spacing.base,
    },
    collectionCoverPlaceholder: {
        fontSize: 32,
    },
    collectionInfo: {
        flex: 1,
        justifyContent: 'center',
    },
    collectionName: {
        fontFamily: 'PP Neue Montreal',
        fontSize: 18,
        fontWeight: '600',
        color: colors.black,
        marginBottom: spacing.xs,
    },
    collectionCount: {
        fontFamily: 'PP Neue Montreal',
        fontSize: 14,
        color: colors.darkGrey,
    },
    loaderContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: spacing.xl,
    },
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
    inputContainer: {
        paddingHorizontal: spacing.xl,
        marginBottom: spacing.xl,
    },
    nameInput: {
        fontFamily: 'PP Neue Montreal',
        fontSize: 24,
        borderBottomWidth: 1,
        borderBottomColor: colors.lightGrey,
        paddingVertical: spacing.sm,
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
