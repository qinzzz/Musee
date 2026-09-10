import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { MOBILE_API_BASE_URL } from '../../api/runtime';
import { presentRequestError } from '../../api/requestErrorPresentation';
import { MuseeButton } from '../../ui/components/MuseeButton';
import { Screen } from '../../ui/components/Screen';
import { colors, radii, spacing, typography } from '../../ui/tokens/theme';
import type { ArtworkMetadataUpdates } from '../mobileArtworkLibraryService';
import type { MobileArtworkRecord } from '../types';

const COPY = {
  title: 'Edit artwork', save: 'Save changes', cancel: 'Cancel',
  required: 'Title and artist cannot be empty.',
  error: 'Musee could not save your changes. Your edits are still here.',
  tagsHint: 'Separate tags with commas.',
} as const;
const FIELDS = [
  { key: 'artworkName', label: 'Title' },
  { key: 'artistName', label: 'Artist' },
  { key: 'date', label: 'Date' },
  { key: 'medium', label: 'Medium' },
  { key: 'tags', label: 'Tags' },
] as const;

export function ArtworkEditSheet({ artwork, onClose, onSaved, onSave }: {
  artwork: MobileArtworkRecord;
  onClose: () => void;
  onSave: (updates: ArtworkMetadataUpdates) => Promise<MobileArtworkRecord | undefined>;
  onSaved: (artwork: MobileArtworkRecord) => void;
}) {
  const [draft, setDraft] = useState({
    artworkName: artwork.artworkName, artistName: artwork.artistName,
    date: artwork.date || '', medium: artwork.medium || '', tags: artwork.tags.join(', '),
  });
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (savingRef.current) return;
    if (!draft.artworkName.trim() || !draft.artistName.trim()) {
      setError(COPY.required);
      return;
    }
    const original = { ...artwork, date: artwork.date || '', medium: artwork.medium || '', tags: artwork.tags.join(', ') };
    const updates: ArtworkMetadataUpdates = {};
    for (const { key } of FIELDS) {
      if (draft[key].trim() !== original[key]) updates[key] = draft[key].trim();
    }
    if (!Object.keys(updates).length) { onClose(); return; }
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const saved = await onSave(updates);
      if (saved) onSaved(saved);
    } catch (cause) {
      const presentation = presentRequestError(cause, {
        apiBaseUrl: MOBILE_API_BASE_URL, fallbackMessage: COPY.error, showTechnicalDetails: false,
      });
      setError(presentation.message);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { if (!savingRef.current) onClose(); }}>
      <Screen>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            <Text accessibilityRole="header" style={styles.heading}>{COPY.title}</Text>
            {FIELDS.map(({ key, label }) => (
              <View key={key} style={styles.field}>
                <Text style={styles.label}>{label}</Text>
                <TextInput accessibilityLabel={label} editable={!saving} value={draft[key]}
                  onChangeText={(value) => setDraft((current) => ({ ...current, [key]: value }))}
                  style={styles.input} multiline autoCorrect={false} />
                {key === 'tags' ? <Text style={styles.hint}>{COPY.tagsHint}</Text> : null}
              </View>
            ))}
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            <MuseeButton label={COPY.save} loading={saving} onPress={() => void save()} />
            <MuseeButton label={COPY.cancel} disabled={saving} variant="secondary" onPress={onClose} />
          </ScrollView>
        </KeyboardAvoidingView>
      </Screen>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { gap: spacing.md, paddingVertical: spacing.lg },
  heading: { color: colors.foreground, fontSize: typography.heading, fontWeight: '600' },
  field: { gap: spacing.xs },
  label: { color: colors.foreground, fontSize: typography.label, fontWeight: '600' },
  input: { minHeight: 52, borderWidth: 1, borderColor: colors.border, borderRadius: radii.input,
    padding: spacing.md, color: colors.foreground, backgroundColor: colors.surface, fontSize: typography.body },
  hint: { color: colors.secondary, fontSize: typography.caption },
  error: { color: colors.danger, fontSize: typography.body },
});
