import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, radii, spacing, typography } from '../../ui/tokens/theme';

type SessionComposerProps = {
  disabled: boolean;
  onSubmit: (text: string) => Promise<boolean>;
};

const PLACEHOLDER = 'Ask Musee';

export function SessionComposer({ disabled, onSubmit }: SessionComposerProps) {
  const [text, setText] = useState('');
  const canSubmit = !disabled && Boolean(text.trim());

  const submit = async () => {
    if (!canSubmit) return;
    const submitted = await onSubmit(text);
    if (submitted) setText('');
  };

  return (
    <View style={styles.container}>
      <TextInput
        accessibilityLabel={PLACEHOLDER}
        editable={!disabled}
        multiline
        onChangeText={setText}
        placeholder={PLACEHOLDER}
        placeholderTextColor={colors.placeholder}
        style={styles.input}
        value={text}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !canSubmit }}
        disabled={!canSubmit}
        onPress={() => void submit()}
        style={({ pressed }) => [
          styles.sendButton,
          !canSubmit && styles.sendButtonDisabled,
          pressed && styles.pressed,
        ]}
      >
        <Text style={styles.sendLabel}>Send</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'flex-end',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  input: {
    color: colors.foreground,
    flex: 1,
    fontSize: typography.body,
    lineHeight: 22,
    maxHeight: 116,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  sendButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radii.button,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  sendButtonDisabled: {
    opacity: 0.35,
  },
  pressed: {
    opacity: 0.72,
  },
  sendLabel: {
    color: colors.onPrimary,
    fontSize: typography.label,
    fontWeight: '600',
  },
});
