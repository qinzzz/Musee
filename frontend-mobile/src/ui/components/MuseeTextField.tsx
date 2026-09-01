import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { colors, radii, spacing, typography } from '../tokens/theme';

type MuseeTextFieldProps = TextInputProps & {
  label: string;
};

export function MuseeTextField({ label, style, ...inputProps }: MuseeTextFieldProps) {
  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        autoCapitalize="none"
        autoCorrect={false}
        placeholderTextColor={colors.placeholder}
        selectionColor={colors.foreground}
        style={[styles.input, style]}
        {...inputProps}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: spacing.xs,
  },
  label: {
    color: colors.secondary,
    fontSize: typography.caption,
    fontWeight: '500',
  },
  input: {
    minHeight: 52,
    borderColor: colors.border,
    borderRadius: radii.input,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: colors.surface,
    color: colors.foreground,
    fontSize: typography.body,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
});
