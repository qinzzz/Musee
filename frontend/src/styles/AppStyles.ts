import { StyleSheet, Dimensions } from 'react-native';
import { colors } from '../constants/colors';

const { width, height } = Dimensions.get('window');

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.lightGrey,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingVertical: 40,
  },
  welcomeContainer: {
    alignItems: 'center',
    zIndex: 10,
  },
  appName: {
    fontSize: 36,
    fontWeight: '600',
    fontFamily: 'Helvetica',
    color: colors.black,
    marginBottom: 4,
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '100',
    fontFamily: 'HelveticaNeue-UltraLight',
    color: colors.black,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  vignette: {
    position: 'absolute',
    width: width,
    height: height,
    zIndex: 1,
  },
  vignetteContainer: {
    position: 'absolute',
    width: width,
    height: height,
    zIndex: 1,
  },
  vignetteBlend: {
    position: 'absolute',
    width: width,
    height: height,
    zIndex: 1,
    mixBlendMode: 'multiply',
  },
  bubble: {
    position: 'absolute',
    width: width * 1.3,
    height: height * 1,
    // left: -width * 0.25,
    // top: -height * 0.25,
  },
  centerBubble: {
    position: 'absolute',
    width: width * 0.8,
    height: height * 0.8,
    // left: -width * 0.25,
    // top: -height * 0.25,
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
  // Camera Screen Styles
  cameraViewfinder: {
    flex: 1,
    backgroundColor: colors.black,
    borderRadius: 30,
    margin: 20,
    overflow: 'hidden',
    position: 'relative',
  },
  closedCamera: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    margin: 20,
  },
  cameraOffText: {
    color: '#666',
    fontSize: 18,
    fontWeight: '300',
    marginBottom: 8,
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
  viewfinderText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '300',
  },
  cameraControlsCenter: {
    backgroundColor: colors.black,
    borderRadius: 30,
    marginBottom: 20,
    marginHorizontal: 20,
    justifyContent: 'center',
    // alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  cameraButton: {
    marginVertical: 2,
    paddingVertical: 25, // padding arround text
    backgroundColor: '#303030',
    borderRadius: 10,
    minWidth: 150,
    alignItems: 'center',
  },
  cameraButtonActive: {
    backgroundColor: '#a1a1a1',
  },
  cameraButtonDisabled: {
    backgroundColor: '#1a1a1a',
  },
  cameraButtonText: {
    color: '#8c8c8c',
    fontSize: 16,
    fontWeight: '500',
  },
  camera: {
    flex: 1,
    backgroundColor: colors.black,
    margin: 20,
    borderRadius: 10,
  },
  curtainOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    margin: 20,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
    // borderRadius: 10,
    zIndex: 10,
  },
});