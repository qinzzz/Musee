import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, Dimensions, Platform } from 'react-native';
import { colors } from '../constants/colors';
import { spacing, borderRadius, shadows } from '../constants/theme';
import { TodaysPickItem } from '../hooks/useTodaysPick';

interface TodaysPickProps {
    picks: TodaysPickItem[];
    isLoading: boolean;
    onPickPress: (pick: TodaysPickItem) => void;
}

const { width: windowWidth } = Dimensions.get('window');
const width = Platform.OS === 'web' ? Math.min(windowWidth, 480) : windowWidth;
const ITEM_SIZE = (width - spacing.lg * 3) / 2.5;

export const TodaysPick: React.FC<TodaysPickProps> = ({ picks, isLoading, onPickPress }) => {
    if (isLoading) {
        return (
            <View style={styles.container}>
                <Text style={styles.title}>TODAY'S PICK</Text>
                <View style={styles.loadingContainer}>
                    <Text style={styles.loadingText}>Loading...</Text>
                </View>
            </View>
        );
    }

    if (picks.length === 0) {
        return null;
    }

    return (
        <View style={styles.container}>
            <Text style={styles.title}>TODAY'S PICK</Text>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
                bounces={true}
            >
                {picks.map((pick) => (
                    <TouchableOpacity
                        key={pick.id}
                        style={styles.pickItem}
                        onPress={() => onPickPress(pick)}
                        activeOpacity={0.8}
                    >
                        <Image
                            source={{ uri: pick.uri }}
                            style={styles.pickImage}
                            resizeMode="cover"
                        />
                        <View style={styles.pickInfo}>
                            <Text style={styles.artistName} numberOfLines={1}>
                                {pick.artistName}
                            </Text>
                            <Text style={styles.artworkName} numberOfLines={1}>
                                {pick.artworkName}
                            </Text>
                        </View>
                    </TouchableOpacity>
                ))}
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginBottom: spacing.xl,
    },
    title: {
        fontFamily: 'IBM Plex Mono',
        fontSize: 14,
        fontWeight: '600',
        color: colors.black,
        marginBottom: spacing.base,
        letterSpacing: 0.5,
    },
    scrollContent: {
        paddingRight: spacing.lg,
        gap: spacing.base,
    },
    pickItem: {
        width: ITEM_SIZE,
        height: ITEM_SIZE + 50, // Image height + info section
        borderRadius: borderRadius.lg,
        overflow: 'hidden',
        backgroundColor: colors.white,
        ...shadows.md,
    },
    pickImage: {
        width: '100%',
        height: ITEM_SIZE,
        backgroundColor: colors.background,
    },
    pickInfo: {
        padding: spacing.sm,
        backgroundColor: colors.white,
    },
    artistName: {
        fontFamily: 'PP Neue Montreal',
        fontSize: 12,
        fontWeight: '600',
        color: colors.black,
        marginBottom: 2,
    },
    artworkName: {
        fontFamily: 'PP Neue Montreal',
        fontSize: 11,
        fontWeight: '400',
        color: colors.darkGrey,
    },
    loadingContainer: {
        height: ITEM_SIZE + 60,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        fontFamily: 'PP Neue Montreal',
        fontSize: 14,
        color: colors.darkGrey,
    },
});
