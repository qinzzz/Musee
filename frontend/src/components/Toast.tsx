import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, ViewStyle } from 'react-native';
import { Typography } from './Typography';
import { colors } from '../constants/colors';
import { spacing, borderRadius, shadows } from '../constants/theme';

interface ToastProps {
  message: string;
  visible: boolean;
  duration?: number;
  onHide?: () => void;
  style?: ViewStyle;
  topOffset?: number;
}

export const Toast: React.FC<ToastProps> = ({
  message,
  visible,
  duration = 1000,
  onHide,
  style,
  topOffset = 80,
}) => {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      // Fade in
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        // Wait for specified duration, then fade out
        setTimeout(() => {
          Animated.timing(opacity, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            if (onHide) {
              onHide();
            }
          });
        }, duration);
      });
    } else {
      // Reset opacity when not visible
      opacity.setValue(0);
    }
  }, [visible, duration, onHide, opacity]);

  if (!visible) {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.toast,
        {
          opacity,
          top: topOffset,
        },
        style,
      ]}
    >
      <Typography style={styles.toastText}>{message}</Typography>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: colors.darkGrey,
    paddingVertical: spacing.base,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.lg,
    zIndex: 2000,
    ...shadows.lg,
  },
  toastText: {
    color: colors.white,
    fontFamily: 'IBM Plex Mono',
    fontSize: 14,
  },
});
