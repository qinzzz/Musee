import { StyleSheet } from 'react-native';
import { colors } from './colors';

// Typography scale
export const typography = {
  // Sizes
  sizes: {
    xs: 11,
    sm: 13,
    base: 14,
    md: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 36,
    '4xl': 64,
    '5xl': 96,
  },
  // Weights
  weights: {
    light: '300' as const,
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: 'bold' as const,
  },
  // Line heights
  lineHeights: {
    tight: 14,
    normal: 18,
    relaxed: 27.5,
  },
  // Letter spacing
  letterSpacing: {
    tight: 0.32,
    normal: 0.4,
    wide: 0.44,
    wider: 1,
  },
};

// Spacing scale (4px base unit)
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 40,
  '4xl': 60,
  '5xl': 80,
  '6xl': 100,
  '7xl': 110,
};

// Border radius scale
export const borderRadius = {
  sm: 5,
  base: 8,
  md: 10,
  lg: 12,
  xl: 16,
  full: 9999,
};

// Shadow presets
export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
  },
  cardDarkShadow: {
    shadowColor: 'rgba(13, 39, 80, 0.25)',
    shadowOffset: { width: 10, height: 10 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 8,
  },
  cardLightShadow: {
    shadowColor: 'rgb(255, 255, 255, 0.85)',
    shadowOffset: { width: -10, height: -10 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 8,
  },
};

// Common text styles
export const textStyles = StyleSheet.create({
  h1: {
    fontSize: typography.sizes['4xl'],
    fontWeight: typography.weights.semibold,
    color: colors.black,
    letterSpacing: typography.letterSpacing.wider,
  },
  h2: {
    fontSize: typography.sizes['2xl'],
    fontWeight: typography.weights.bold,
    color: colors.black,
    letterSpacing: typography.letterSpacing.wide,
  },
  h3: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.medium,
    color: colors.black,
    letterSpacing: typography.letterSpacing.normal,
  },
  body: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.regular,
    color: colors.black,
  },
  bodyLight: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.light,
    color: colors.black,
    letterSpacing: typography.letterSpacing.tight,
    lineHeight: typography.lineHeights.relaxed,
  },
  label: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.light,
    color: colors.darkGrey,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.wider,
  },
  caption: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.light,
    color: colors.darkGrey,
    lineHeight: typography.lineHeights.tight,
  },
  badge: {
    fontSize: typography.sizes.base,
    fontWeight: typography.weights.semibold,
    color: colors.white,
  },
});

// Common container styles
export const containerStyles = StyleSheet.create({
  card: {
    backgroundColor: '#FDFDFD',
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    ...shadows.lg,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  spaceBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});

// Animation configs
export const animations = {
  spring: {
    default: {
      tension: 40,
      friction: 8,
    },
    bouncy: {
      tension: 50,
      friction: 10,
    },
    stiff: {
      tension: 65,
      friction: 10,
    },
  },
  timing: {
    fast: 250,
    default: 600,
    slow: 800,
    verySlow: 2000,
  },
};
