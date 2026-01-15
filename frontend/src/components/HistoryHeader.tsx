import React from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { Typography } from './Typography';
import { colors } from '../constants/colors';
import { spacing } from '../constants/theme';
import { homeStyles } from '../screens/styles/HomeStyles';
import { HistoryTab } from '../hooks/useHistory';

interface HistoryHeaderProps {
    selectedTab: HistoryTab;
    onTabChange: (tab: HistoryTab) => void;
    isSelectionMode?: boolean;
    onToggleSelection?: () => void;
}

export const HistoryHeader: React.FC<HistoryHeaderProps> = ({
    selectedTab,
    onTabChange,
    isSelectionMode = false,
    onToggleSelection,
}) => {
    return (
        <View style={homeStyles.headerSection}>
            <View style={styles.topRow}>
                <Typography variant="h0" style={homeStyles.title}>HISTORY</Typography>
                <TouchableOpacity
                    onPress={onToggleSelection}
                    style={styles.batchButton}
                    activeOpacity={0.7}
                >
                    <Text style={styles.batchButtonText}>
                        {isSelectionMode ? 'CANCEL' : 'SELECT'}
                    </Text>
                </TouchableOpacity>
            </View>
            <View style={styles.tabContainer}>
                <TouchableOpacity
                    onPress={() => onTabChange('all')}
                    activeOpacity={0.7}
                >
                    <Text style={[
                        styles.tabText,
                        selectedTab === 'all' && styles.tabTextActive
                    ]}>
                        All
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    onPress={() => onTabChange('recognized')}
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
                    onPress={() => onTabChange('unknown')}
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
    );
};

const styles = StyleSheet.create({
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
    topRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        width: '100%',
    },
    batchButton: {
        paddingVertical: spacing.xs,
        paddingHorizontal: spacing.sm,
    },
    batchButtonText: {
        fontSize: 12,
        fontFamily: 'PP Neue Montreal',
        fontWeight: '500',
        color: colors.black,
        letterSpacing: 0.5,
    },
});
