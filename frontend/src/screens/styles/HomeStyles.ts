import { StyleSheet, Dimensions } from 'react-native';
import { colors } from '../../constants/colors';
import { spacing, typography, shadows, borderRadius } from '../../constants/theme';

const { width, height } = Dimensions.get('window');

export const homeStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
  },
  content: {
    flex: 1,
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
    // fontSize: 26,
    fontFamily: 'PP Neue Montreal',
    fontWeight: '500',
    color: colors.black,
    textTransform: 'uppercase',
    // letterSpacing: 0.52,
    // lineHeight: 29,
  },
  secondaryTitle: {
    fontSize: 20,
    fontFamily: 'PP Neue Montreal Medium',
    fontWeight: '500',
    color: colors.black,
    textTransform: 'capitalize',
    letterSpacing: 0.4,
    lineHeight: 25,
  },
  normalText: {
    fontSize: 16,
    fontFamily: 'PP Neue Montreal Book',
    fontWeight: '300',
    color: colors.black,
    textTransform: 'capitalize',
    letterSpacing: 0.32,
    lineHeight: 25,
  },
  // Artwork Image Placeholder
  artworkImagePlaceholder: {
    width: width * 0.85,
    height: 532,
    backgroundColor: colors.midGrey,
    borderRadius: 12,
    marginTop: 10,
  },
  // Camera Button Container
  cameraButtonContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 20,
  },
  // Floating Camera Button
  floatingCameraButton: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: colors.black,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.lg,
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
    letterSpacing: 0.32,
    lineHeight: 26,
  },
  navLabelActive: {
    fontSize: 16,
    fontFamily: 'PP Neue Montreal Medium',
    fontWeight: '500',
    color: colors.black,
    textTransform: 'capitalize',
    letterSpacing: 0.32,
    lineHeight: 26,
  },
});
