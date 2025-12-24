import React from 'react';
import { View, StyleSheet, TouchableOpacity, Image, Text } from 'react-native';
import { colors } from '../constants/colors';
import { spacing, borderRadius } from '../constants/theme';
import { GalleryItem } from '../hooks/useGallery';

interface GalleryGridItemProps {
    item: GalleryItem;
    onPress: () => void;
    onLongPress: () => void;
    isDeleting: boolean;
    onConfirmDelete: () => void;
    itemWidth: number;
}

export const GalleryGridItem: React.FC<GalleryGridItemProps> = ({
    item,
    onPress,
    onLongPress,
    isDeleting,
    onConfirmDelete,
    itemWidth,
}) => {
    return (
        <TouchableOpacity
            style={[styles.gridItem, { width: itemWidth }]}
            activeOpacity={0.8}
            onPress={onPress}
            onLongPress={onLongPress}
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
                            onPress={onConfirmDelete}
                            activeOpacity={0.8}
                        >
                            <Text style={styles.deleteText}>Delete</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>
            <Text style={styles.titleText} numberOfLines={1}>
                {item.artworkName}
            </Text>
            <Text style={styles.itemText} numberOfLines={1}>
                {item.artistName}
            </Text>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    gridItem: {
        marginBottom: 12,
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
    titleText: {
        fontSize: 11,
        fontWeight: '600',
        color: colors.black,
        letterSpacing: 0.2,
        textTransform: 'uppercase',
    },
    itemText: {
        fontSize: 10,
        fontWeight: '600',
        color: colors.midGrey,
        letterSpacing: 0.2,
        textTransform: 'capitalize',
    },
    deleteOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
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
        fontSize: 12,
        fontWeight: '600',
        letterSpacing: 0.5,
        color: colors.black,
    },
});
