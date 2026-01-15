import React from 'react';
import { View, StyleSheet, Text, ActivityIndicator } from 'react-native';
import { colors } from '../constants/colors';
import { spacing } from '../constants/theme';

interface HistoryEmptyStateProps {
    isLoading: boolean;
}

export const HistoryEmptyState: React.FC<HistoryEmptyStateProps> = ({ isLoading }) => {
    if (isLoading) {
        return (
            <View style={styles.emptyContainer}>
                <ActivityIndicator size="large" color={colors.black} />
                <Text style={styles.loadingText}>Loading your history...</Text>
            </View>
        );
    }

    return (
        <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No history yet</Text>
            <Text style={styles.emptySubtext}>
                Start scanning artworks to build your history
            </Text>
        </View>
    );
};

const styles = StyleSheet.create({
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
