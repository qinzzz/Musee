import React from 'react';
import { View, Image, StyleSheet, Dimensions, ViewStyle } from 'react-native';
import { colors } from '../constants/colors';
import { spacing, shadows, borderRadius } from '../constants/theme';

// deprecated! use FramedArtworkCard instead
interface ArtworkCardProps {
  photoUri: string;
  style?: ViewStyle;
  scale?: number;
  dualShadow?: boolean;
}

const { width } = Dimensions.get('window');

export const ArtworkCard: React.FC<ArtworkCardProps> = ({
  photoUri,
  style,
  scale = 1,
  dualShadow = false
}) => {
  const cardWidth = (width - 80) * scale;
  const cardPadding = spacing.lg * scale;
  const cardPaddingBottom = spacing['5xl'] * scale;
  const imageHeight = 440 * scale;

  const cardContent = (
    <View style={[
      styles.imageContainer,
      !dualShadow && styles.singleShadow,
      {
        width: cardWidth,
        padding: cardPadding,
        paddingBottom: cardPaddingBottom,
      },
    ]}>
      <Image
        source={{ uri: photoUri }}
        style={[styles.artworkImage, { height: imageHeight }]}
        resizeMode="cover"
      />
    </View>
  );

  if (dualShadow) {
    return (
      <View style={[styles.outerShadow, style]}>
        <View style={styles.innerShadow}>
          {cardContent}
        </View>
      </View>
    );
  }

  return <View style={style}>{cardContent}</View>;
};

const styles = StyleSheet.create({
  imageContainer: {
    backgroundColor: '#FDFDFD',
    borderRadius: borderRadius.lg,
    alignSelf: 'center',
    backfaceVisibility: 'hidden',
  },
  singleShadow: {
    ...shadows.lg,
  },
  outerShadow: {
    ...shadows.cardDarkShadow,
  },
  innerShadow: {
    ...shadows.cardLightShadow,
  },
  artworkImage: {
    width: '100%',
    height: 440,
    backgroundColor: colors.white,
  },
});
