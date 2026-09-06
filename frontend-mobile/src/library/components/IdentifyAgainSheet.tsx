import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MuseeButton } from '../../ui/components/MuseeButton';
import { Screen } from '../../ui/components/Screen';
import { colors, radii, spacing, typography } from '../../ui/tokens/theme';
import { IDENTIFY_CLUE_REQUIRED, type IdentifyAgainHints } from '../mobileArtworkLibraryService';

const COPY = {
  title: 'Identify Again', cancel: 'Cancel',
  description: "Provide artist name, artwork title, or any clue you know. We'll use it as guidance when identifying the artwork again.",
};
const FIELDS = [
  { key: 'artistName', label: 'Artist name', placeholder: 'Enter artist name' },
  { key: 'artworkName', label: 'Artwork title', placeholder: 'Enter artwork title' },
  { key: 'additionalClue', label: 'Additional clue (optional)', placeholder: 'Museum, subject, style, partial text, or anything else you remember' },
] as const;

export function IdentifyAgainSheet({ values, onChange, onClose, onSubmit }: {
  values: IdentifyAgainHints;
  onChange: (values: IdentifyAgainHints) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <Modal animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <Screen>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            <Text accessibilityRole="header" style={styles.title}>{COPY.title}</Text>
            <Text style={styles.body}>{COPY.description}</Text>
            {FIELDS.map(({ key, label, placeholder }) => (
              <View key={key} style={styles.field}>
                <Text style={styles.body}>{label}</Text>
                <TextInput accessibilityLabel={label} placeholder={placeholder} placeholderTextColor={colors.placeholder}
                  value={values[key]} onChangeText={(value) => onChange({ ...values, [key]: value })}
                  multiline style={styles.input} autoCorrect={false} autoFocus={key === 'artistName'} />
              </View>
            ))}
            <Text style={styles.body}>{IDENTIFY_CLUE_REQUIRED}</Text>
            <MuseeButton label={COPY.title} disabled={!Object.values(values).some((value) => value.trim())} onPress={onSubmit} />
            <MuseeButton label={COPY.cancel} variant="secondary" onPress={onClose} />
          </ScrollView>
        </KeyboardAvoidingView>
      </Screen>
    </Modal>
  );
}
const styles = StyleSheet.create({
  flex: { flex: 1 }, content: { gap: spacing.md, paddingVertical: spacing.lg }, field: { gap: spacing.xs },
  title: { fontSize: typography.heading, color: colors.foreground, fontWeight: '600' },
  body: { fontSize: typography.body, color: colors.secondary, lineHeight: 24 },
  input: { minHeight: 52, padding: spacing.md, borderWidth: 1, borderColor: colors.border,
    borderRadius: radii.input, fontSize: typography.body, color: colors.foreground, backgroundColor: colors.surface },
});
