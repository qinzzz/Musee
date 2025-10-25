import React from 'react';
import { TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { Typography } from './Typography';

interface ActionButtonProps {
  onPress: () => void;
  label: string;
  style?: ViewStyle;
  disabled?: boolean;
}

export const ActionButton: React.FC<ActionButtonProps> = ({
  onPress,
  label,
  style,
  disabled = false,
}) => {
  return (
    <TouchableOpacity
      style={[styles.actionButton, style, disabled && styles.disabled]}
      onPress={onPress}
      activeOpacity={0.7}
      disabled={disabled}
    >
      <Typography style={styles.actionButtonText}>{label}</Typography>
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
  disabled: {
    opacity: 0.5,
  },
  actionButtonText: {
    fontFamily: 'IBM Plex Mono',
    fontSize: 14,
    fontWeight: '800',
    color: '#D4D3D3',
    letterSpacing: 0.28,
    textTransform: 'uppercase',
    textAlign: 'center',
    lineHeight: 28,
  },
});
