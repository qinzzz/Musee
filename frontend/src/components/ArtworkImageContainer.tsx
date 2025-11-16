import React from 'react';
import { View, Image, StyleSheet, ViewStyle, ImageStyle } from 'react-native';
import { borderRadius, shadows, spacing } from '../constants/theme';

interface ArtworkImageContainerProps {
  imageUri: string;
  aspectRatio?: number;
  borderRadiusSize?: 'sm' | 'md' | 'lg' | 'xl';
  withShadow?: boolean;
  marginTop?: number;
  containerStyle?: ViewStyle;
  imageStyle?: ImageStyle;
}

export const ArtworkImageContainer: React.FC<ArtworkImageContainerProps> = ({
  imageUri,
  aspectRatio = 1,
  borderRadiusSize = 'md',
  withShadow = false,
  marginTop = spacing.md,
  containerStyle,
  imageStyle,
}) => {
  const wrapperStyles: ViewStyle[] = [
    styles.wrapper,
    {
      marginTop,
    },
    withShadow && shadows.md,
    containerStyle,
  ].filter(Boolean) as ViewStyle[];

  const imageContainerStyles: ViewStyle = {
    aspectRatio,
    borderRadius: borderRadius[borderRadiusSize],
  };

  return (
    <View style={wrapperStyles}>
      <View style={[styles.imageContainer, imageContainerStyles]}>
        <Image
          source={{ uri: imageUri }}
          style={[styles.artworkImage, imageStyle]}
          resizeMode="cover"
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
  imageContainer: {
    width: '100%',
    alignItems: 'center',
    overflow: 'hidden',
  },
  artworkImage: {
    width: '100%',
    height: '100%',
  },
});
