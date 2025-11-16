import { StyleSheet, Dimensions } from 'react-native';
import { colors } from '../../constants/colors';
import { spacing, borderRadius, shadows } from '../../constants/theme';

const { width, height } = Dimensions.get('window');

export const cameraStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.darkGrey,
    justifyContent: 'space-between',
  },
  backButton: {
    position: 'absolute',
    left: spacing.lg,
    zIndex: 1000,
    padding: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    ...shadows.md,
  },
  cameraViewfinder: {
    width: width,
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  closedCamera: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    margin: spacing.lg,
  },
  cameraOffText: {
    color: '#666',
    fontSize: 18,
    fontWeight: '300',
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  cameraOffSubtext: {
    color: '#444',
    fontSize: 14,
    fontWeight: '200',
    textAlign: 'center',
  },
  camera: {
    flex: 1,
    backgroundColor: colors.black,
  },
  curtainOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  // Camera Controls (Figma design)
  controlsContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: spacing['2xl'],
    paddingBottom: spacing['4xl'],
    paddingTop: spacing.lg,
    gap: spacing['2xl'],
    backgroundColor: colors.darkGrey,
  },
  largeButton: {
    width: 160,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.red,
    borderColor: colors.white,
  },
  devButton: {
    marginTop: spacing['3xl'],
    backgroundColor: '#4A90E2',
    paddingHorizontal: spacing['2xl'],
    paddingVertical: spacing.base,
    borderRadius: borderRadius.base,
    borderWidth: 2,
    borderColor: colors.white,
  },
  devButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});
