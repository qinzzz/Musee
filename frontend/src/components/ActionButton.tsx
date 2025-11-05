import React from 'react';
import { TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { Typography } from './Typography';
import { colors } from '../constants/colors';

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
  const buttonStyle = theme === 'light' ? styles.lightButton : styles.actionButton;
  const textStyle = theme === 'light' ? styles.lightButtonText : styles.actionButtonText;

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
  actionButton: {
    backgroundColor: '#2A2A2A',
    borderWidth: 2,
    borderRadius: 17,
    height: 38,
    width: 'auto',
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightButton: {
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.black,
    borderRadius: 17,
    height: 38,
    width: 'auto',
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
  actionButtonText: {
    fontFamily: 'IBM Plex Mono',
    fontSize: 14,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: 0.28,
    textTransform: 'uppercase',
    textAlign: 'center',
    lineHeight: 28,
  },
  lightButtonText: {
    fontFamily: 'IBM Plex Mono',
    fontSize: 14,
    fontWeight: '600',
    color: colors.black,
    letterSpacing: 0.28,
    textAlign: 'center',
    lineHeight: 28,
  },
});
