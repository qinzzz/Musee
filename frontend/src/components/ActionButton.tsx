import React from 'react';
import { TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { Typography } from './Typography';
import { colors } from '../constants/colors';
import { spacing, borderRadius } from '../constants/theme';

interface ActionButtonProps {
  onPress: () => void;
  label: string;
  style?: ViewStyle;
  disabled?: boolean;
  theme?: 'dark' | 'light';
}

export const ActionButton: React.FC<ActionButtonProps> = ({
  onPress,
  label,
  style,
  disabled = false,
  theme = 'dark',
}) => {
  const buttonStyle = theme === 'light' ? styles.lightButton : styles.darkButton;
  const textStyle = theme === 'light' ? styles.lightButtonText : styles.darkButtonText;

  return (
    <TouchableOpacity
      style={[buttonStyle, style, disabled && styles.disabled]}
      onPress={onPress}
      activeOpacity={0.7}
      disabled={disabled}
    >
      <Typography style={textStyle}>{label}</Typography>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  darkButton: {
    backgroundColor: '#2A2A2A',
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    height: 38,
    width: 'auto',
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightButton: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.black,
    borderRadius: borderRadius.lg,
    height: 38,
    width: 'auto',
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
  darkButtonText: {
    fontFamily: 'PP Neue Montreal',
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
    textAlign: 'center',
    lineHeight: 28,
    letterSpacing: 0.32,
  },
  lightButtonText: {
    fontFamily: 'PP Neue Montreal',
    fontSize: 14,
    fontWeight: '600',
    color: colors.black,
    textAlign: 'center',
    lineHeight: 28,
    letterSpacing: 0.32,
  },
});
