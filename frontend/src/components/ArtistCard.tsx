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
      {/* Shadow layer */}
      {!hideShadow && <View style={styles.shadowLayer} />}

      {/* Main card */}
      <TouchableOpacity
        style={[
          styles.card,
          isExpanded && styles.cardExpanded,
        ]}
        onPress={onPress}
        activeOpacity={1}
      >
        <View style={styles.content}>
          <View style={styles.textContainer}>
            {isExpanded && details && (
              <View style={styles.playIconContainer}>
                <Text style={styles.playIcon}>▶</Text>
              </View>
            )}
            {artistName && <Text style={styles.artistName}>{artistName}</Text>}
            {details && <Text style={styles.details}>{details}</Text>}
          </View>

          {isExpanded && description && (
            <Text style={styles.description}>{description}</Text>
          )}
        </View>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  cardWrapper: {
    position: 'relative',
    marginBottom: 9,
    width: 332,
  },
  shadowLayer: {
    position: 'absolute',
    top: 12,
    right: -12,
    bottom: -12,
    left: 12,
    backgroundColor: colors.black,
    borderRadius: borderRadius.base,
    zIndex: -1,
  },
  card: {
    backgroundColor: colors.midGrey,
    borderWidth: 1,
    borderColor: colors.black,
    borderRadius: borderRadius.base,
    minHeight: 64,
    justifyContent: 'flex-start',
  },
  cardExpanded: {
    minHeight: 120,
    justifyContent: 'flex-start',
    backgroundColor: colors.white
  },
  content: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 10,
  },
  textContainer: {
    gap: 4,
    alignItems: 'center',
    position: 'relative',
  },
  playIconContainer: {
    position: 'absolute',
    left: 0,
    top: 1,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playIcon: {
    fontSize: 20,
    color: colors.black,
  },
  artistName: {
    fontFamily: 'PP Neue Montreal',
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.black,
    textAlign: 'center',
    lineHeight: 30,
    textTransform: 'capitalize',
  },
  details: {
    fontFamily: 'PP Neue Montreal',
    fontSize: 15,
    fontWeight: 'medium',
    color: colors.black,
    textAlign: 'center',
    lineHeight: 28,
    textTransform: 'capitalize',
  },
  description: {
    fontFamily: 'PP Neue Montreal',
    fontSize: 13,
    fontWeight: '400',
    color: '#2F2F2F',
    textAlign: 'center',
  },
});
