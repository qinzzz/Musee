import React from 'react';
import { View, Image, StyleSheet, TouchableOpacity } from 'react-native';
import Svg, { Path, G } from 'react-native-svg';
import { colors } from '../constants/colors';
import LottieView from 'lottie-react-native';

import { spacing, typography, shadows, borderRadius } from '../constants/theme';

// Plus Icon Component (converted from Figma SVG)
const PlusIcon = () => (
  <Svg width="132" height="132" viewBox="0 0 132 132" fill="none">
    <G id="mynaui:plus-solid">
      <Path
        id="Vector"
        d="M71.5 33C71.5 31.5413 70.9205 30.1424 69.8891 29.1109C68.8576 28.0795 67.4587 27.5 66 27.5C64.5413 27.5 63.1424 28.0795 62.1109 29.1109C61.0795 30.1424 60.5 31.5413 60.5 33V60.5H33C31.5413 60.5 30.1424 61.0795 29.1109 62.1109C28.0795 63.1424 27.5 64.5413 27.5 66C27.5 67.4587 28.0795 68.8576 29.1109 69.8891C30.1424 70.9205 31.5413 71.5 33 71.5H60.5V99C60.5 100.459 61.0795 101.858 62.1109 102.889C63.1424 103.921 64.5413 104.5 66 104.5C67.4587 104.5 68.8576 103.921 69.8891 102.889C70.9205 101.858 71.5 100.459 71.5 99V71.5H99C100.459 71.5 101.858 70.9205 102.889 69.8891C103.921 68.8576 104.5 67.4587 104.5 66C104.5 64.5413 103.921 63.1424 102.889 62.1109C101.858 61.0795 100.459 60.5 99 60.5H71.5V33Z"
        fill="#B0B0B0"
      />
    </G>
  </Svg>
);


interface ArtworkPlaceholderProps {
  onPress?: () => void;
}

// Main Artwork Placeholder Component
export const ArtworkPlaceholder = ({ onPress }: ArtworkPlaceholderProps) => {
  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Light Effect Background */}
      <View style={styles.lottieContainer}>
        <LottieView
          source={{ uri: 'https://lottie.host/66549cb2-a3af-4986-8ab2-393f89546d85/7MzwLnQj7T.lottie' }}
          autoPlay
          loop
          style={styles.lottieAnimation}
        />
      </View>

      {/* Dashed Border Box */}
      <View style={styles.dashedBox}>
        {/* Plus Icon */}
        <View style={styles.plusIconContainer}>
          <PlusIcon />
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    width: 250,
    height: 360,
    marginTop: spacing["4xl"],
    position: 'relative',
    alignSelf: 'center',
    alignItems: 'center',
  },
  lottieContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lottieAnimation: {
    width: '150%',
    height: '150%',
  },
  dashedBox: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderWidth: 5,
    borderStyle: 'dashed',
    borderColor: '#B0B0B0',
    borderRadius: 43,
    justifyContent: 'center',
    alignItems: 'center',
  },
  plusIconContainer: {
    width: 132,
    height: 132,
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0.5,
  },
});
