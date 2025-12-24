import React from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { Typography } from './Typography';
import { colors } from '../constants/colors';
import { spacing } from '../constants/theme';
import { homeStyles } from '../screens/styles/HomeStyles';

interface GalleryHeaderProps {
    selectedTab: 'recognized' | 'unknown';
    onTabChange: (tab: 'recognized' | 'unknown') => void;
}

export const GalleryHeader: React.FC<GalleryHeaderProps> = ({
    selectedTab,
    onTabChange,
}) => {
    return (
        <View style={homeStyles.headerSection}>
            <Typography variant="h1" style={homeStyles.title}>HISTORY</Typography>
            <View style={styles.tabContainer}>
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
});
