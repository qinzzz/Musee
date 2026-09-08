import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, radii, spacing, typography } from '../../ui/tokens/theme';

import { MAX_SESSION_ATTACHMENTS, type SessionContextInput } from '../mobileSessionContextService';
export type SessionComposerAttachment = SessionContextInput;

type SessionComposerProps = {
  attachments: SessionComposerAttachment[];
  disabled: boolean;
  onChooseLibraryArtwork: () => void;
  onChoosePhoto: () => void;
  onRemoveAttachment: (index: number) => void;
  onTakePhoto: () => void;
  onSubmit: (text: string, attachments: SessionComposerAttachment[]) => Promise<boolean>;
};

const COPY = {
  placeholder: 'Ask Musee', notePlaceholder: 'Add a note (optional)',
  readyLabel: 'Artwork ready to upload',
  withLabel: 'Artwork with label ready to upload',
  labelBadge: '+ Label',
  removeLabel: 'Remove artwork',
  camera: 'Camera', photos: 'Photos', library: 'Library', send: 'Send',
} as const;

export function SessionComposer({
  attachments,
  disabled,
  onChooseLibraryArtwork,
  onChoosePhoto,
  onRemoveAttachment,
  onSubmit,
  onTakePhoto,
}: SessionComposerProps) {
  const [text, setText] = useState('');
  const canSubmit = !disabled && Boolean(text.trim() || attachments.length);

  const submit = async () => {
    if (!canSubmit) return;
    const submitted = await onSubmit(text, attachments);
    if (submitted) setText('');
  };

  return (
    <View style={styles.container}>
      {attachments.length > 0 ? <ScrollView
        horizontal
        style={styles.attachments}
        contentContainerStyle={styles.attachmentStrip}
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {attachments.map((attachment, index) => (
          <View key={attachment.kind === 'library' ? attachment.artwork.id : attachment.asset.uri} style={styles.imageContainer}>
            <Image
              accessibilityLabel={attachment.kind === 'library'
                ? `${attachment.artwork.artworkName} by ${attachment.artwork.artistName}`
                : attachment.labelAsset ? COPY.withLabel : COPY.readyLabel}
              contentFit="cover"
              source={{
                uri: attachment.kind === 'library'
                  ? attachment.artwork.resolvedThumbnailUri
                  : attachment.asset.uri,
              }}
              style={styles.attachmentImage}
            />
            {attachment.kind === 'local' && attachment.labelAsset ? (
              <Text style={styles.labelBadge}>{COPY.labelBadge}</Text>
            ) : null}
            <Pressable
              accessibilityLabel={COPY.removeLabel}
              accessibilityRole="button"
              accessibilityState={{ disabled }}
              disabled={disabled}
              onPress={() => onRemoveAttachment(index)}
              style={({ pressed }) => [styles.closeTarget, pressed && styles.pressed]}
            >
              <View style={styles.closeBadge}>
                <SymbolView name="xmark" tintColor={colors.foreground} size={12} />
              </View>
            </Pressable>
          </View>
        ))}
      </ScrollView> : null}
      <View style={styles.inputRow}>
        <TextInput
          accessibilityLabel={COPY.placeholder}
          editable={!disabled}
          multiline
          onChangeText={setText}
          placeholder={attachments.length ? COPY.notePlaceholder : COPY.placeholder}
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
          <Text style={styles.sendLabel}>{COPY.send}</Text>
        </Pressable>
      </View>
      {attachments.length < MAX_SESSION_ATTACHMENTS ? (
        <View style={styles.attachmentActions}>
          <Pressable
            accessibilityRole="button"
            disabled={disabled}
            onPress={onTakePhoto}
            style={({ pressed }) => [styles.attachmentButton, pressed && styles.pressed]}
          >
            <Text style={styles.attachmentButtonLabel}>{COPY.camera}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={disabled}
            onPress={onChoosePhoto}
            style={({ pressed }) => [styles.attachmentButton, pressed && styles.pressed]}
          >
            <Text style={styles.attachmentButtonLabel}>{COPY.photos}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={disabled}
            onPress={onChooseLibraryArtwork}
            style={({ pressed }) => [styles.attachmentButton, pressed && styles.pressed]}
          >
            <Text style={styles.attachmentButtonLabel}>{COPY.library}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  labelBadge: { position: 'absolute', bottom: 4, left: 4, color: colors.onPrimary,
    backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 4, paddingHorizontal: 4, fontSize: typography.caption },
  attachments: { flexGrow: 0 },
  attachmentStrip: { gap: spacing.sm },
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
  attachmentImage: {
    backgroundColor: colors.border,
    borderRadius: radii.input,
    height: 64,
    width: 64,
  },
  imageContainer: {
    width: 64,
    height: 64,
  },
  closeTarget: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 44,
    height: 44,
    alignItems: 'flex-end',
    padding: 3,
  },
  closeBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
