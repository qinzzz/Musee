import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
} from 'react-native';

import { colors, radii, spacing, typography } from '../tokens/theme';

type MuseeButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  label: string;
  loading?: boolean;
  tone?: 'default' | 'inverse';
  variant?: 'primary' | 'secondary';
};

export function MuseeButton({
  disabled,
  label,
  loading = false,
  tone = 'default',
  variant = 'primary',
  ...pressableProps
}: MuseeButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        variant === 'secondary' ? styles.secondary : styles.primary,
        tone === 'inverse' && (
          variant === 'secondary' ? styles.inverseSecondary : styles.inversePrimary
        ),
        pressed && styles.pressed,
        isDisabled && styles.disabled,
      ]}
      {...pressableProps}
    >
      {loading ? (
        <ActivityIndicator
          color={tone === 'inverse'
            ? (variant === 'primary' ? colors.foreground : colors.onPrimary)
            : (variant === 'primary' ? colors.onPrimary : colors.foreground)}
        />
      ) : (
        <Text
          style={[
            styles.label,
            variant === 'secondary' ? styles.secondaryLabel : styles.primaryLabel,
            tone === 'inverse' && (
              variant === 'secondary'
                ? styles.inverseSecondaryLabel
                : styles.inversePrimaryLabel
            ),
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: radii.button,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: colors.primary,
  },
  secondary: {
    backgroundColor: 'transparent',
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
  },
  inversePrimary: {
    backgroundColor: colors.onPrimary,
  },
  inverseSecondary: {
    borderColor: 'rgba(255, 255, 255, 0.56)',
  },
  pressed: {
    opacity: 0.82,
  },
  disabled: {
    opacity: 0.55,
  },
  label: {
    fontSize: typography.label,
    fontWeight: '600',
  },
  primaryLabel: {
    color: colors.onPrimary,
  },
  secondaryLabel: {
    color: colors.foreground,
  },
  inversePrimaryLabel: {
    color: colors.foreground,
  },
  inverseSecondaryLabel: {
    color: colors.onPrimary,
  },
});
