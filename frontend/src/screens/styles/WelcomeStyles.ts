import { StyleSheet, Dimensions } from 'react-native';
import { colors } from '../../constants/colors';
import { spacing, typography } from '../../constants/theme';

const { width, height } = Dimensions.get('window');

export const welcomeStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing['3xl'],
    paddingVertical: spacing['4xl'],
  },
  welcomeContainer: {
    alignItems: 'center',
    zIndex: 10,
  },
  appName: {
    fontSize: typography.sizes['4xl'],
    // fontWeight: typography.weights.semibold,
    fontFamily: 'Bitcount Grid Single',
    color: colors.black,
    marginBottom: spacing.xs,
    letterSpacing: typography.letterSpacing.wider,
  },
  subtitle: {
    fontSize: typography.sizes.base,
    fontWeight: 'thin',
    fontFamily: 'IBM Plex Mono',
    color: colors.black,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  // Background animation elements
  vignetteContainer: {
    position: 'absolute',
    width: width,
    height: height,
    zIndex: 1,
  },
  bubble: {
    position: 'absolute',
    width: width * 1.3,
    height: height * 1,
  },
  bubbleGradient: {
    flex: 1,
    borderRadius: Math.max(width, height),
  },
  blurOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: width,
    height: height,
    zIndex: 3,
  },
  galleryButton: {
    position: 'absolute',
    right: spacing.xl,
    zIndex: 11,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  galleryButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.black,
    letterSpacing: 0.32,
  },
  galleryButtonContainer: {
    position: 'absolute',
    top: height * 0.5 + 60, // Position below subtitle with spacing
    alignSelf: 'center',
    zIndex: 11,
  },
  actionButtonsContainer: {
    position: 'absolute',
    top: height * 0.5 + 80, // Position below subtitle with spacing
    flexDirection: 'column',
    gap: 10,
    alignSelf: 'center',
    zIndex: 11,
  },
});
