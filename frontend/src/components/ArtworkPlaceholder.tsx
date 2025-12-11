import React from 'react';
import { View, Image, StyleSheet, TouchableOpacity, Text, ScrollView, Dimensions } from 'react-native';
import Svg, { Path, G } from 'react-native-svg';
import LottieView from 'lottie-react-native';
import { Typography } from '../components';

import { spacing, typography, shadows, borderRadius } from '../constants/theme';
import { colors } from '../constants/colors';

const { width: screenWidth } = Dimensions.get('window');
const LOTTIE_ITEM_WIDTH = screenWidth * 0.6; // Each item takes 60% of screen width
const NUM_LOTTIE_ITEMS = 5; // Number of animations to show

// Plus Icon Component (converted from Figma SVG)
interface PlusIconProps {
  size?: number;
  color?: string;
}

const PlusIcon = ({ size = 132, color = '#B0B0B0' }: PlusIconProps) => (
  <Svg width={size} height={size} viewBox="0 0 132 132" fill="none">
    <G id="mynaui:plus-solid">
      <Path
        id="Vector"
        d="M71.5 33C71.5 31.5413 70.9205 30.1424 69.8891 29.1109C68.8576 28.0795 67.4587 27.5 66 27.5C64.5413 27.5 63.1424 28.0795 62.1109 29.1109C61.0795 30.1424 60.5 31.5413 60.5 33V60.5H33C31.5413 60.5 30.1424 61.0795 29.1109 62.1109C28.0795 63.1424 27.5 64.5413 27.5 66C27.5 67.4587 28.0795 68.8576 29.1109 69.8891C30.1424 70.9205 31.5413 71.5 33 71.5H60.5V99C60.5 100.459 61.0795 101.858 62.1109 102.889C63.1424 103.921 64.5413 104.5 66 104.5C67.4587 104.5 68.8576 103.921 69.8891 102.889C70.9205 101.858 71.5 100.459 71.5 99V71.5H99C100.459 71.5 101.858 70.9205 102.889 69.8891C103.921 68.8576 104.5 67.4587 104.5 66C104.5 64.5413 103.921 63.1424 102.889 62.1109C101.858 61.0795 100.459 60.5 99 60.5H71.5V33Z"
        fill={color}
      />
    </G>
  </Svg>
);


interface ArtworkPlaceholderProps {
  onPress?: () => void;
  onImportFromAlbum?: () => void;
  language?: string;
}

// Main Artwork Placeholder Component
export const ArtworkPlaceholder = ({ onPress, onImportFromAlbum, language }: ArtworkPlaceholderProps) => {
  const languageLabels: { [key: string]: string } = {
    en: 'English',
    zh: '中文',
  };
  return (
    <View
      style={styles.container}
    >
      {/* Dashed Border Box */}
      <View style={styles.dashedBox}
        >
        {/* Plus Icon */}
        <View style={styles.plusIconContainer}>
          <PlusIcon size={66}/>
        </View>
          <TouchableOpacity
            style={styles.importButton}
            onPress={onPress}
            activeOpacity={0.7}
          >
            <Text style={styles.importButtonText}>Scan with camera</Text>
          </TouchableOpacity>
          {/* Import from Album Button */}
          <TouchableOpacity
            style={styles.importButton}
            onPress={onImportFromAlbum}
            activeOpacity={0.7}
          >
            <Text style={styles.importButtonText}>Import from Album</Text>
          </TouchableOpacity>

          {/* Language Indicator */}
          {language && (
            <Text style={styles.languageIndicator}>
              Current language: {languageLabels[language] || language}
            </Text>
          )}
      </View>

      {/* Horizontal Scrollable Lottie Carousel */}
      <View style={styles.lottieContainer}>
        <Text style={styles.subTitle}>Today's pick</Text>
        <ScrollView
          horizontal
          pagingEnabled={false}
          decelerationRate="fast"
          snapToInterval={LOTTIE_ITEM_WIDTH}
          snapToAlignment="center"
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.lottieScrollContent}
        >
          {Array.from({ length: NUM_LOTTIE_ITEMS }).map((_, index) => (
            <View key={index} style={styles.lottieItem}>
              <LottieView
                source={{ uri: 'https://lottie.host/1bff431a-d19b-4138-aa0f-4715baf65d50/RDISFsxgIr.lottie'}}
                autoPlay
                loop
                style={styles.lottieAnimation}
              />
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: '80%',
    paddingHorizontal: spacing["2xl"],
    position: 'relative',
    alignSelf: 'center',
    alignItems: 'center',
    zIndex: 0,
  },
  lottieContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '60%', // Give it a height so it's visible
    justifyContent: 'flex-end', // Push content to the bottom
    alignItems: 'center',
    zIndex: 1,
    overflow: 'hidden',
  },
  subTitle: {
    fontSize: 18,
    fontFamily: 'PP Neue Montreal Book',
    fontWeight: '600',
    color: colors.darkGrey,
    flexDirection: 'row',
    alignSelf:"flex-start",
    paddingLeft: spacing.xl,
    marginTop: spacing.xl,
  },
  lottieScrollContent: {
    alignItems: 'center',
    paddingHorizontal: (screenWidth - LOTTIE_ITEM_WIDTH) / 2, // Center first and last items
  },
  lottieItem: {
    width: LOTTIE_ITEM_WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lottieAnimation: {
    width: '100%',
    aspectRatio: 1, // Maintain aspect ratio based on width
  },
  dashedBox: {
    // width: '80%',
    paddingHorizontal: spacing['xl'],
    paddingVertical: spacing.md,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.midGrey,
    borderRadius: borderRadius.lg,
    justifyContent: 'space-evenly',
    alignItems: 'center',
    backgroundColor: colors.halfOpacityWhite,
    zIndex: 100,
  },
  plusIconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0.5,
  },
  normalText: {
    fontSize: 16,
    fontFamily: 'PP Neue Montreal Book',
    fontWeight: '600',
    color: colors.midGrey,
    lineHeight: 25,
  },
  // Import from Album Button
  importButton: {
    marginTop: spacing.base,
    paddingVertical: spacing.base,
    paddingHorizontal: spacing['xl'],
    backgroundColor: colors.white,
    borderRadius: borderRadius.base,
    borderWidth: 1,
    borderColor: colors.black,
    zIndex: 100,
    ...shadows.sm,
  },
  importButtonText: {
    fontSize: 16,
    fontFamily: 'PP Neue Montreal Medium',
    fontWeight: '500',
    color: colors.black,
    textAlign: 'center',
  },
  languageIndicator: {
    marginTop: spacing.sm,
    fontSize: 11,
    fontFamily: 'IBM Plex Mono',
    color: colors.darkGrey,
    textAlign: 'center',
  },
});
