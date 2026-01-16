import React from 'react';
import { View, Dimensions, Platform, StyleSheet } from 'react-native';

/**
 * Scanlines Effect Component
 * Creates a retro CRT/TV scanline overlay effect
 */
export const ScanlinesEffect: React.FC = () => {
  const { height } = Dimensions.get('window');

  if (Platform.OS === 'web') {
    return (
      <View
        style={[
          StyleSheet.absoluteFillObject,
          {
            backgroundColor: 'transparent',
            // @ts-ignore - repeating-linear-gradient is a web-only value
            backgroundImage: 'repeating-linear-gradient(rgba(51, 51, 51, 0) 0px, rgba(51, 51, 51, 0) 2px, rgba(51, 51, 51, 0.3) 3px, rgba(51, 51, 51, 0.3) 4px)',
            pointerEvents: 'none',
            zIndex: 999,
          } as any
        ]}
      />
    );
  }

  const scanlines = [];
  // Create scanlines every 4 pixels
  for (let i = 0; i < height; i += 4) {
    scanlines.push(
      <View
        key={i}
        style={{
          position: 'absolute',
          top: i,
          left: 0,
          right: 0,
          height: 1,
          backgroundColor: '#333',
          opacity: 0.3,
        }}
      />
    );
  }

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="none">
      {scanlines}
    </View>
  );
};
