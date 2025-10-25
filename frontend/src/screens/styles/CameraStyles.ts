import { StyleSheet, Dimensions } from 'react-native';
import { colors } from '../../constants/colors';
import { spacing, borderRadius, shadows } from '../../constants/theme';

const { width, height } = Dimensions.get('window');

export const cameraStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  cameraViewfinder: {
    flex: 1,
    backgroundColor: '#373737',
    borderRadius: borderRadius.xl,
    marginHorizontal: spacing.lg + 5,
    marginTop: spacing['4xl'],
    marginBottom: spacing.sm + 5,
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
  activeCameraView: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  camera: {
    flex: 1,
    backgroundColor: colors.black,
    margin: spacing.lg,
    borderRadius: borderRadius.base,
  },
  curtainOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    margin: spacing.lg,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  // Camera Controls (Figma design)
  controlsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: 46,
    gap: spacing.base - 6,
  },
  emptyButton: {
    width: 120,
    height: 120,
    backgroundColor: '#D9D9D9',
    borderRadius: borderRadius.base,
    ...shadows.cardDarkShadow,
  },
  captureButton: {
    width: 120,
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonInner: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#D9D9D9',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 8,
    borderColor: '#E2E5E8',
    ...shadows.cardDarkShadow,
  },
  redDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FF0000',
  },
  toggleButton: {
    width: 120,
    height: 120,
    backgroundColor: '#D9D9D9',
    borderRadius: borderRadius.base,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.cardDarkShadow,
  },
  toggleButtonText: {
    fontSize: spacing.base,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.32,
  },
  onText: {
    color: colors.black,
    fontWeight: '400',
  },
  slashText: {
    color: colors.black,
    fontWeight: '400',
  },
  offText: {
    color: '#868686',
    fontWeight: '400',
  },
  devButton: {
    marginTop: spacing['3xl'],
    backgroundColor: '#4A90E2',
    paddingHorizontal: spacing['2xl'],
    paddingVertical: spacing.base,
    borderRadius: borderRadius.base,
    borderWidth: 2,
    borderColor: '#2E5C8A',
  },
  devButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});
