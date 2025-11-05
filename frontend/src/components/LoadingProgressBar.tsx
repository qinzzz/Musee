import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import LottieView from 'lottie-react-native';
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
}) => {
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
      <LottieView
        source={{ uri: 'https://lottie.host/336b07be-89fa-4bb2-92a3-ff4241dc801b/97gZTsxMdf.lottie' }}
        autoPlay
        loop
        style={styles.lottie}
      />
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
  lottie: {
    width: 100,
    height: 100,
  },
});
