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
    justifyContent: 'flex-start',
    paddingHorizontal: spacing['3xl'],
    paddingTop: 300,
  },
  welcomeContainer: {
    alignItems: 'center',
    zIndex: 10,
  },
  appName: {
    fontSize: typography.sizes['4xl'],
    fontWeight: 'bold',
    fontStyle: 'italic',
    fontFamily: 'PP Neue Montreal',
    color: colors.black,
    marginBottom: spacing.xs,
    letterSpacing: typography.letterSpacing.wider,
  },
  subtitle: {
    fontSize: typography.sizes.md,
    fontWeight: 'medium',
    fontFamily: 'PP Neue Montreal',
    fontStyle: 'italic',
    color: colors.orangeTheme,
    textAlign: 'center',
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
    top: height * 0.5 + 120, // Position below identity dropdown
    flexDirection: 'column',
    gap: 10,
    alignSelf: 'center',
    zIndex: 11,
  },
  identityContainer: {
    position: 'absolute',
    top: height * 0.5 + 50, // Position below subtitle
    alignSelf: 'center',
    zIndex: 11,
    alignItems: 'center',
  },
  identityLabel: {
    fontSize: 12,
    fontFamily: 'IBM Plex Mono',
    color: colors.darkGrey,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  identityDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.black,
    minWidth: 150,
    justifyContent: 'space-between',
  },
  identityText: {
    fontSize: 14,
    fontFamily: 'IBM Plex Mono',
    color: colors.black,
    fontWeight: '600',
  },
  dropdownArrow: {
    fontSize: 10,
    color: colors.black,
    marginLeft: spacing.sm,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: spacing.lg,
    width: width - 80,
    maxHeight: height * 0.6,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: 'IBM Plex Mono',
    fontWeight: '600',
    color: colors.black,
    marginBottom: spacing.base,
    textAlign: 'center',
  },
  identityList: {
    maxHeight: 300,
  },
  identityOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.base,
    borderRadius: 8,
    marginVertical: spacing.xs,
    backgroundColor: colors.background,
  },
  identityOptionSelected: {
    backgroundColor: colors.black,
  },
  identityOptionText: {
    fontSize: 16,
    fontFamily: 'IBM Plex Mono',
    color: colors.black,
  },
  identityOptionTextSelected: {
    color: colors.white,
    fontWeight: '600',
  },
  checkmark: {
    fontSize: 18,
    color: colors.white,
  },
});
