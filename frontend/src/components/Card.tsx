import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { borderRadius, shadows, spacing } from '../constants/theme';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  shadow?: 'sm' | 'md' | 'lg' | 'card';
  padding?: keyof typeof spacing;
}

export const Card: React.FC<CardProps> = ({
  children,
  style,
  shadow = 'lg',
  padding = 'lg'
}) => {
  return (
    <View style={[
      styles.card,
      shadows[shadow],
      { padding: spacing[padding] },
      style
    ]}>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FDFDFD',
    borderRadius: borderRadius.lg,
  },
});
