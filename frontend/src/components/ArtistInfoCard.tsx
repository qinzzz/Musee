import React from 'react';
import { View, StyleSheet, Dimensions, ViewStyle } from 'react-native';
import { Typography, Body } from './Typography';
import { spacing, borderRadius, shadows } from '../constants/theme';


interface ArtistInfoCardProps {
  artistName?: string;
  description: string;
  style?: ViewStyle;
}

const { width } = Dimensions.get('window');

export const ArtistInfoCard: React.FC<ArtistInfoCardProps> = ({
  artistName = 'THE ARTIST',
  description,
  style
}) => {
  return (
    <View style={[styles.processCard, style]}>
      <View style={styles.processCardInner}>
        <View style={styles.processHeader}>
          <Typography variant="h2" style={styles.processTitle}>
            {artistName}
          </Typography>
        </View>
        <Body style={styles.processDescription}>
          {description}
        </Body>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  processCard: {
    alignSelf: 'center',
    width: width - 40,
    marginBottom: spacing.xl,
    ...shadows.cardLightShadow
  },
  processCardInner: {
    backgroundColor: 'rgba(239, 239, 239, 0.9)',
    borderRadius: borderRadius.lg,
    padding: spacing.lg - 2,
    paddingVertical: spacing.lg,
    gap: spacing.xl,
    ...shadows.cardDarkShadow,
  },
  processHeader: {
    marginBottom: spacing.md,
  },
  processTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4A4A4A',
    letterSpacing: 0.32,
    textTransform: 'uppercase',
    lineHeight: 27.463,
  },
  processDescription: {
    fontSize: 16,
    fontWeight: '400',
    color: '#3B3B3B',
    letterSpacing: 0.64,
    lineHeight: 24,
  },
});
