import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { colors } from '../constants/colors';
import { borderRadius, spacing, textStyles } from '../constants/theme';

interface BadgeProps {
  children: React.ReactNode;
  color?: string;
  style?: ViewStyle;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  color = colors.techBlue,
  style,
}) => {
  return (
    <View style={[styles.badge, { backgroundColor: color }, style]}>
      <Text style={textStyles.badge}>{children}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    minWidth: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
