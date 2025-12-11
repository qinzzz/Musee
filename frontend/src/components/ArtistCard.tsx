import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { colors } from '../constants/colors';
import { spacing, borderRadius } from '../constants/theme';

interface ArtistCardProps {
  artistName: string;
  details: string;
  description?: string;
  isExpanded?: boolean;
  onPress: () => void;
  style?: ViewStyle;
  hideShadow?: boolean;
}

export const ArtistCard: React.FC<ArtistCardProps> = ({
  artistName,
  details,
  description,
  isExpanded = false,
  onPress,
  style,
  hideShadow = false,
}) => {
  return (
    <View style={[styles.cardWrapper, style]}>
      <TouchableOpacity
        style={[
          styles.card,
          isExpanded && styles.cardExpanded,
          hideShadow && styles.cardWithoutDivider,
        ]}
        onPress={onPress}
        activeOpacity={0.9}
      >
        <View style={styles.content}>
          <View style={styles.textContainer}>
            {artistName && <Text style={styles.artistName}>{artistName}</Text>}
            {details && <Text style={styles.details}>{details}</Text>}
          </View>

          {isExpanded && description && (
            <View style={styles.descriptionContainer}>
              <Text style={styles.description}>{description}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  cardWrapper: {
    position: 'relative',
    marginBottom: spacing.base,
    width: '100%',
  },
  card: {
    backgroundColor: colors.transparent,
    borderRadius: 0,
    minHeight: 64,
    justifyContent: 'flex-start',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.15)',
  },
  cardExpanded: {
    minHeight: 120,
    justifyContent: 'flex-start',
    backgroundColor: colors.white,
    borderRadius: borderRadius.base,
  },
  cardWithoutDivider: {
    borderBottomWidth: 0,
  },
  content: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.base,
    gap: spacing.sm,
  },
  textContainer: {
    gap: spacing.xs,
    alignItems: 'flex-start',
    position: 'relative',
  },
  artistName: {
    fontFamily: 'PP Neue Montreal',
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.black,
    textAlign: 'left',
    lineHeight: 26,
    textTransform: 'capitalize',
  },
  details: {
    fontFamily: 'PP Neue Montreal',
    fontSize: 14,
    fontWeight: '500',
    color: colors.darkGrey,
    textAlign: 'left',
    lineHeight: 22,
    textTransform: 'capitalize',
  },
  descriptionContainer: {
    backgroundColor: colors.lightGrey,
    borderRadius: borderRadius.base,
    padding: spacing.base,
    width: '100%',
  },
  description: {
    fontFamily: 'PP Neue Montreal',
    fontSize: 13,
    fontWeight: '400',
    color: colors.darkGrey,
    textAlign: 'left',
  },
});
