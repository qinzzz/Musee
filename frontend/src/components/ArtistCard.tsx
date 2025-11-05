import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { colors } from '../constants/colors';
import { spacing } from '../constants/theme';

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
    top: 17,
    right: -16,
    bottom: -16,
    left: 16,
    backgroundColor: colors.black,
    borderRadius: 5,
    zIndex: -1,
  },
  card: {
    backgroundColor: colors.midGrey,
    borderWidth: 2,
    borderColor: colors.black,
    borderRadius: 5,
    minHeight: 73,
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
    fontFamily: 'IBM Plex Mono',
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.black,
    textAlign: 'center',
    letterSpacing: 0.4,
    lineHeight: 30,
    textTransform: 'capitalize',
  },
  details: {
    fontFamily: 'Ubuntu Mono',
    fontSize: 14,
    fontWeight: '400',
    color: colors.black,
    textAlign: 'center',
    letterSpacing: 0.28,
    lineHeight: 28,
    textTransform: 'capitalize',
  },
  description: {
    fontFamily: 'IBM Plex Mono',
    fontSize: 12,
    fontWeight: '400',
    color: '#2F2F2F',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
});
