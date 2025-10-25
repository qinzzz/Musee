import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, ViewStyle } from 'react-native';
import { colors } from '../constants/colors';
import { Typography } from './Typography';
import { spacing } from '../constants/theme';

interface LoadingProgressBarProps {
  message?: string;
  style?: ViewStyle;
  barColor?: string;
  backgroundColor?: string;
}

export const LoadingProgressBar: React.FC<LoadingProgressBarProps> = ({
  message,
  style,
  barColor = '#2A2A2A',
}) => {
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Animated progress bar that fills up smoothly
    Animated.loop(
      Animated.sequence([
        Animated.timing(progressAnim, {
          toValue: 1,
          duration: 10000, // 10 seconds
          useNativeDriver: false,
        }),
        Animated.timing(progressAnim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: false,
        }),
      ])
    ).start();
  }, []);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={[styles.container, style]}>
      {message && (
        <Typography
          variant="body"
          style={styles.message}
        >
          {message}
        </Typography>
      )}
      <View style={[styles.progressBarContainer]}>
        <Animated.View
          style={[
            styles.progressBar,
            {
              width: progressWidth,
              backgroundColor: barColor,
            },
          ]}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing['2xl'],
  },
  message: {
    fontFamily: 'IBM Plex Mono',
    fontWeight: 800,
    fontSize: 16,
    marginBottom: spacing.lg,
    color: colors.black,
    textAlign: 'center',
  },
  progressBarContainer: {
    width: 200,
    height: 20,
    borderColor: colors.black,
    borderRadius: 5,
    borderWidth: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '120%',
    borderRadius: 0,
  },
});
