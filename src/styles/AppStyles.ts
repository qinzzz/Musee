import { StyleSheet, Dimensions } from 'react-native';
import { colors } from '../constants/colors';

const { width, height } = Dimensions.get('window');

export const vignetteConfigs = {
  // Main corner gradients - centers pushed far outside screen
  topLeft: {
    colors: [colors.topLeftVignette, colors.transparent],
    stops: [0, 0.7],
    center: [-width * 0.8, -height * 0.8],
    radius: width * 1.8,
  },
  topRight: {
    colors: [colors.topRightVignette, colors.transparent],
    stops: [0, 0.8],
    center: [width * 1.5, -height * 0.6],
    radius: width * 2.2,
  },
  bottomLeft: {
    colors: [colors.bottomLeftVignette, colors.transparent],
    stops: [0, 0.7],
    center: [-width * 0.8, height * 1.8],
    radius: width * 1.8,
  },
  bottomRight: {
    colors: [colors.bottomRightVignette, colors.transparent],
    stops: [0, 0.8],
    center: [width * 1.5, height * 1.6],
    radius: width * 2.2,
  },
  
  // Edge transition gradients - centers on screen borders
  topCenter: {
    colors: [colors.topLeftVignette, colors.topRightVignette, colors.transparent],
    stops: [0, 0.2, 0.8],
    center: [width * 0.5, -height * 0.3],
    radius: width * 1.8,
  },
  leftCenter: {
    colors: [colors.topLeftVignette, colors.bottomLeftVignette, colors.transparent],
    stops: [0, 0.2, 0.8],
    center: [-width * 0.4, height * 0.5],
    radius: width * 1.4,
  },
  rightCenter: {
    colors: [colors.topRightVignette, colors.bottomRightVignette, colors.transparent],
    stops: [0, 0.2, 0.8],
    center: [width * 1.5, height * 0.5],
    radius: width * 1.4,
  },
  bottomCenter: {
    colors: [colors.bottomLeftVignette, colors.bottomRightVignette, colors.transparent],
    stops: [0, 0.2, 0.8],
    center: [width * 0.5, height * 1.4],
    radius: width * 1.8,
  },
  
  // Accent gradients - centers moved outside with larger radius
  accent1: {
    colors: [colors.topLeftVignette, colors.transparent],
    stops: [0, 0.9],
    center: [-width * 0.3, -height * 0.1],
    radius: width * 0.8,
  },
  accent2: {
    colors: [colors.topRightVignette, colors.transparent],
    stops: [0, 0.9],
    center: [width * 1.2, -height * 0.1],
    radius: width * 1.1,
  },
  accent3: {
    colors: [colors.bottomLeftVignette, colors.transparent],
    stops: [0, 0.9],
    center: [-width * 0.2, height * 1.3],
    radius: width * 0.8,
  },
  accent4: {
    colors: [colors.bottomRightVignette, colors.transparent],
    stops: [0, 0.9],
    center: [width * 1.1, height * 1.1],
    radius: width * 1.0,
  },
};

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
  topLeftVignette: {
    top: 0,
    left: 0,
  },
  topRightVignette: {
    top: 0,
    left: 0,
  },
  bottomLeftVignette: {
    top: 0,
    left: 0,
  },
  bottomRightVignette: {
    top: 0,
    left: 0,
  },
  bubble: {
    position: 'absolute',
    width: width * 1.5,
    height: height * 1.5,
    left: -width * 0.25,
    top: -height * 0.25,
    zIndex: 1
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
});