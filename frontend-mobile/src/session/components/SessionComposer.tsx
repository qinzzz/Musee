import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { NativeImageAsset } from '../../capture/types';
import type { MobileArtworkRecord } from '../../library/types';
import { colors, radii, spacing, typography } from '../../ui/tokens/theme';

export type SessionComposerAttachment =
  | { asset: NativeImageAsset; kind: 'local' }
  | { artwork: MobileArtworkRecord; kind: 'library' };

type SessionComposerProps = {
  attachment: SessionComposerAttachment | null;
  disabled: boolean;
  onChooseLibraryArtwork: () => void;
  onChoosePhoto: () => void;
  onRemoveAttachment: () => void;
  onTakePhoto: () => void;
  onSubmit: (text: string, attachment: SessionComposerAttachment | null) => Promise<boolean>;
};

const PLACEHOLDER = 'Ask Musee';

export function SessionComposer({
  attachment,
  disabled,
  onChooseLibraryArtwork,
  onChoosePhoto,
  onRemoveAttachment,
  onSubmit,
  onTakePhoto,
}: SessionComposerProps) {
  const [text, setText] = useState('');
  const canSubmit = !disabled && Boolean(text.trim() || attachment);

  const submit = async () => {
    if (!canSubmit) return;
    const submitted = await onSubmit(text, attachment);
    if (submitted) setText('');
  };

  return (
    <View style={styles.container}>
      {attachment ? (
        <View style={styles.attachmentRow}>
          <Image
            accessibilityLabel={attachment.kind === 'library'
              ? `${attachment.artwork.artworkName} by ${attachment.artwork.artistName}`
              : 'Artwork ready to upload'}
            contentFit="cover"
            source={{
              uri: attachment.kind === 'library'
                ? attachment.artwork.resolvedThumbnailUri
                : attachment.asset.uri,
            }}
            style={styles.attachmentImage}
          />
          <View style={styles.attachmentCopy}>
            <Text numberOfLines={1} style={styles.attachmentTitle}>
              {attachment.kind === 'library'
                ? attachment.artwork.artworkName
                : 'Artwork ready'}
            </Text>
            <Text style={styles.attachmentSource}>
              {attachment.kind === 'library'
                ? attachment.artwork.artistName
                : attachment.asset.source === 'camera' ? 'Camera' : 'Photos'}
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Remove artwork"
            accessibilityRole="button"
            disabled={disabled}
            onPress={onRemoveAttachment}
            style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}
          >
            <Text style={styles.removeLabel}>Remove</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.inputRow}>
        <TextInput
          accessibilityLabel={PLACEHOLDER}
          editable={!disabled}
          multiline
          onChangeText={setText}
          placeholder={attachment ? 'Add a note (optional)' : PLACEHOLDER}
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
      {!attachment ? (
        <View style={styles.attachmentActions}>
          <Pressable
            accessibilityRole="button"
            disabled={disabled}
            onPress={onTakePhoto}
            style={({ pressed }) => [styles.attachmentButton, pressed && styles.pressed]}
          >
            <Text style={styles.attachmentButtonLabel}>Camera</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={disabled}
            onPress={onChoosePhoto}
            style={({ pressed }) => [styles.attachmentButton, pressed && styles.pressed]}
          >
            <Text style={styles.attachmentButtonLabel}>Photos</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={disabled}
            onPress={onChooseLibraryArtwork}
            style={({ pressed }) => [styles.attachmentButton, pressed && styles.pressed]}
          >
            <Text style={styles.attachmentButtonLabel}>Library</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
    padding: spacing.sm,
  },
  inputRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: spacing.sm,
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
  attachmentActions: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  attachmentButton: {
    justifyContent: 'center',
    minHeight: 36,
  },
  attachmentButtonLabel: {
    color: colors.secondary,
    fontSize: typography.label,
    fontWeight: '600',
  },
  attachmentRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  attachmentImage: {
    backgroundColor: colors.border,
    borderRadius: radii.input,
    height: 64,
    width: 64,
  },
  attachmentCopy: {
    flex: 1,
    gap: 2,
  },
  attachmentTitle: {
    color: colors.foreground,
    fontSize: typography.label,
    fontWeight: '600',
  },
  attachmentSource: {
    color: colors.secondary,
    fontSize: typography.caption,
  },
  removeButton: {
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.sm,
  },
  removeLabel: {
    color: colors.danger,
    fontSize: typography.caption,
    fontWeight: '600',
  },
});
