import { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MuseeTextField } from '../ui/components/MuseeTextField';
import { MuseeButton } from '../ui/components/MuseeButton';
import { colors, spacing, typography } from '../ui/tokens/theme';

const COPY = { name: 'Board name', save: 'Save', cancel: 'Cancel' };
export function BoardNameSheet({ visible, title, initialName = '', busy, error, onCancel, onSave }: {
  visible: boolean; title: string; initialName?: string; busy: boolean; error: string | null;
  onCancel: () => void; onSave: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(initialName);
  useEffect(() => { if (visible) setName(initialName); }, [visible, initialName]);
  return <Modal visible={visible} presentationStyle="pageSheet" animationType="slide"
    onRequestClose={() => { if (!busy) onCancel(); }}>
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <MuseeTextField label={COPY.name} value={name} onChangeText={setName} maxLength={200}
        autoFocus autoCapitalize="sentences" editable={!busy} />
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <View style={styles.actions}>
        <MuseeButton label={COPY.cancel} variant="secondary" disabled={busy} onPress={onCancel} />
        <MuseeButton label={COPY.save} loading={busy} disabled={!name.trim()} onPress={() => void onSave(name.trim())} />
      </View>
    </SafeAreaView>
  </Modal>;
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg, gap: spacing.lg },
  title: { color: colors.foreground, fontSize: typography.heading, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: spacing.sm },
  error: { color: colors.danger, fontSize: typography.label },
});
