import React from 'react';
import { View, Text, StyleSheet, Dimensions, ViewStyle } from 'react-native';
import { ArtworkCard } from './ArtworkCard';
import { colors } from '../constants/colors';

interface SignedArtworkCardProps {
  photoUri: string;
  artistName: string;
  style?: ViewStyle;
  scale?: number;
  dualShadow?: boolean;
}

const { width } = Dimensions.get('window');

export const SignedArtworkCard: React.FC<SignedArtworkCardProps> = ({
  photoUri,
  artistName,
  style,
  scale = 1,
  dualShadow = false
}) => {
  const signatureBottom = 30 * scale;
  const signatureRight = 40 * scale;
  const signatureFontSize = 24 * scale;

  return (
    <View style={style}>
      <ArtworkCard photoUri={photoUri} scale={scale} dualShadow={dualShadow} />
      <View style={[styles.signatureContainer, { bottom: signatureBottom, right: signatureRight }]}>
        <Text style={[styles.signatureText, { fontSize: signatureFontSize }]}>{artistName}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  signatureContainer: {
    position: 'absolute',
    bottom: 30,
    right: 40,
  },
  signatureText: {
    fontFamily: 'Figma Hand',
    fontSize: 24,
    color: colors.black,
    letterSpacing: 0.48,
    textTransform: 'capitalize',
    lineHeight: 27.463,
    transform: [{ rotate: '-8.395deg' }],
  },
});
