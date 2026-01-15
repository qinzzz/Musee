import React from 'react';
import { View, Image, StyleSheet, ViewStyle, ImageStyle, TouchableOpacity } from 'react-native';
import { borderRadius, shadows, spacing } from '../constants/theme';
import { normalizeImageUri } from '../utils/imageUtils';

interface ArtworkImageContainerProps {
  imageUri: string;
  aspectRatio?: number;
  borderRadiusSize?: 'sm' | 'md' | 'lg' | 'xl';
  withShadow?: boolean;
  marginTop?: number;
  containerStyle?: ViewStyle;
  imageStyle?: ImageStyle;
  onPress?: () => void;
}

export const ArtworkImageContainer: React.FC<ArtworkImageContainerProps> = ({
  imageUri,
  aspectRatio = 1,
  borderRadiusSize = 'lg',
  withShadow = false,
  marginTop = spacing.md,
  containerStyle,
  imageStyle,
  onPress,
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

  const imageContent = (
    <View style={[styles.imageContainer, imageContainerStyles]}>
      <Image
        source={{ uri: normalizeImageUri(imageUri) }}
        style={[styles.artworkImage, imageStyle]}
        resizeMode="cover"
      />
    </View>
  );

  return (
    <View style={wrapperStyles}>
      {onPress ? (
        <TouchableOpacity onPress={onPress} activeOpacity={0.9}>
          {imageContent}
        </TouchableOpacity>
      ) : (
        imageContent
      )}
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
