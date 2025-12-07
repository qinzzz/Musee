import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { colors } from '../constants/colors';
import { spacing, borderRadius } from '../constants/theme';

interface TopicChipProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  textColor?: string;
}

export const TopicChip: React.FC<TopicChipProps> = ({
  label,
  onPress,
  disabled = false,
  textColor
}) => {
  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.7}
      disabled={disabled}
    >
      <Text style={[styles.label, textColor && { color: textColor }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.lightGrey,
  },
  label: {
    fontFamily: 'IBM Plex Mono',
    fontSize: 13,
    fontWeight: '400',
    color: colors.darkGrey,
    letterSpacing: 0.26,
  },
});
