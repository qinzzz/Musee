import React from 'react';
import { View, Image, StyleSheet, ViewStyle, TouchableOpacity, Text } from 'react-native';
import { colors } from '../constants/colors';

interface FramedArtworkCardProps {
  photoUri?: string | undefined;
  style?: ViewStyle;
  onClose?: () => void;
  children?: React.ReactNode;
}

export const FramedArtworkCard: React.FC<FramedArtworkCardProps> = ({
  photoUri,
  style,
  onClose,
  children,
}) => {
  return (
    <View style={[styles.container, style]}>
      {/* Close button (X icon) in top-right corner */}
      {onClose && (
        <TouchableOpacity
          style={styles.closeButton}
          onPress={onClose}
          activeOpacity={0.7}
        >
          <Text style={styles.closeIcon}>✕</Text>
        </TouchableOpacity>
      )}

      {/* Horizontal line separator */}
      <View style={styles.separator} />

      {/* Artwork image */}
      {photoUri && (
        <Image
          source={{ uri: photoUri }}
          style={styles.artworkImage}
          resizeMode="cover"
        />
      )}
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: 250,
    height: 300,
    alignSelf: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderWidth: 3,
    borderColor: '#353535',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 32,
    gap: 24,
    overflow: 'hidden',
    zIndex: 9999,
    elevation: 9999, // For Android
  },
  closeButton: {
    position: 'absolute',
    top: -10,
    right: -10,
    width: 15.525,
    height: 15.525,
    transform: [{ rotate: '45deg' }],
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  closeIcon: {
    fontSize: 18,
    color: colors.black,
    fontWeight: 'bold',
  },
  separator: {
    width: '100%',
    height: 2,
    backgroundColor: colors.black,
  },
  artworkImage: {
    width: 200,
    height: 200,
  },
});
