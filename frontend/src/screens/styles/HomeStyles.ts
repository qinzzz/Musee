import { StyleSheet, Dimensions } from 'react-native';
import { colors } from '../../constants/colors';
import { spacing, shadows, borderRadius } from '../../constants/theme';

const { width, height } = Dimensions.get('window');

export const homeStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.lightGrey,
  },
  content: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
  },
  contentWrapper: {
    width: '100%',
    maxWidth: 600,
    alignItems: 'center',
  },
  // Header Section
  headerSection: {
    alignItems: 'flex-start',
    width: '100%',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.base,
  },
  title: {
    fontFamily: 'PP Neue Montreal',
    fontWeight: '500',
    color: colors.black,
    textTransform: 'uppercase',
    // letterSpacing: 0.52,
    // lineHeight: 29,
  },
  secondaryTitle: {
    fontSize: 18,
    fontFamily: 'PP Neue Montreal Medium',
    fontWeight: '500',
    color: colors.darkGrey,
    lineHeight: 25,
  },
  normalText: {
    fontSize: 16,
    fontFamily: 'PP Neue Montreal Book',
    fontWeight: '400',
    color: colors.darkGrey,
    lineHeight: 25,
  },
  // Artwork Image Placeholder
  artworkImagePlaceholder: {
    width: '90%',
    maxWidth: 400,
    aspectRatio: 3 / 4,
    height: undefined, // Let aspectRatio take over
    backgroundColor: colors.midGrey,
    borderRadius: 12,
    marginTop: 10,
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
    ...shadows.sm,
  },
  importButtonText: {
    fontSize: 16,
    fontFamily: 'PP Neue Montreal Medium',
    fontWeight: '500',
    color: colors.black,
    textAlign: 'center',
  },
  // Bottom Navigation Bar
  bottomNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: colors.white,
    paddingTop: 23,
    paddingHorizontal: spacing['3xl'],
    height: 98,
    gap: 68,
  },
  navButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  navLabel: {
    fontSize: 16,
    fontFamily: 'PP Neue Montreal Medium',
    fontWeight: '500',
    color: '#6D6D6D',
    textTransform: 'capitalize',
    lineHeight: 26,
    paddingRight: 4,
  },
  navLabelActive: {
    fontSize: 16,
    fontFamily: 'PP Neue Montreal Medium',
    fontWeight: '500',
    color: colors.black,
    textTransform: 'capitalize',
    lineHeight: 18,
    paddingRight: 4,
  },
});
