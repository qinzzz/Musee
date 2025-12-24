import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';
import { spacing, shadows, borderRadius } from '../constants/theme';
import { Typography, MoreIcon, ArrowIcon } from './index';

interface SavedArtworkDetailHeaderProps {
    onBack: () => void;
    onDelete: () => void;
    isExplorationVisible: boolean;
}

export const SavedArtworkDetailHeader: React.FC<SavedArtworkDetailHeaderProps> = ({
    onBack,
    onDelete,
    isExplorationVisible,
}) => {
    const safeAreaInsets = useSafeAreaInsets();
    const [showMenu, setShowMenu] = useState(false);

    return (
        <>
            {/* Back Button */}
            <TouchableOpacity
                style={[styles.backButton, { top: safeAreaInsets.top + 16 }]}
                onPress={onBack}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
                <ArrowIcon size={24} color={colors.darkGrey} direction="left" />
            </TouchableOpacity>

            {/* Three-dot Menu */}
            <TouchableOpacity
                style={[styles.menuButton, { top: safeAreaInsets.top + 16 }]}
                onPress={() => setShowMenu(!showMenu)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
                <MoreIcon size={24} color={colors.darkGrey} />
            </TouchableOpacity>

            {/* Dropdown Menu */}
            {showMenu && (
                <View style={[styles.dropdownMenu, { top: safeAreaInsets.top + 56 }]}>
                    <TouchableOpacity
                        style={styles.menuItem}
                        onPress={() => {
                            setShowMenu(false);
                            onDelete();
                        }}
                    >
                        <Typography style={styles.menuItemText}>Delete</Typography>
                    </TouchableOpacity>
                </View>
            )}

            {/* Overlay to close menu when clicking outside */}
            {showMenu && (
                <TouchableOpacity
                    style={styles.menuOverlay}
                    activeOpacity={1}
                    onPress={() => setShowMenu(false)}
                />
            )}
        </>
    );
};

const styles = StyleSheet.create({
    backButton: {
        position: 'absolute',
        left: spacing.lg,
        zIndex: 1000,
        padding: spacing.sm,
        backgroundColor: colors.white,
        borderRadius: borderRadius.lg,
        ...shadows.md,
    },
    menuButton: {
        position: 'absolute',
        right: spacing.lg,
        zIndex: 1000,
        padding: spacing.sm,
        backgroundColor: colors.white,
        borderRadius: borderRadius.lg,
        ...shadows.md,
    },
    menuOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 999,
    },
    dropdownMenu: {
        position: 'absolute',
        right: spacing.lg,
        zIndex: 1001,
        backgroundColor: colors.white,
        borderRadius: borderRadius.md,
        minWidth: 120,
        ...shadows.lg,
        overflow: 'hidden',
    },
    menuItem: {
        paddingVertical: spacing.base,
        paddingHorizontal: spacing.lg,
    },
    menuItemText: {
        fontFamily: 'PP Neue Montreal',
        fontSize: 14,
        color: colors.darkGrey,
    },
});
