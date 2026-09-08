import { useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { Alert, KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { SessionRecord } from '@musee/client-core';
import { mobileSessionManagement } from '../../api/runtime';
import { KeyboardScrollView } from '../../ui/components/KeyboardScrollView';
import { MuseeTextField } from '../../ui/components/MuseeTextField';
import { MuseeButton } from '../../ui/components/MuseeButton';
import { showPendingToast, showToast } from '../../ui/toast';
import { colors, spacing, typography } from '../../ui/tokens/theme';

const COPY = {
  actions: 'Session actions', edit: 'Edit session', remove: 'Delete session', details: 'Session details',
  name: 'Session name', goal: 'Session goal', placeholder: 'Add a focus for this session…',
  save: 'Save', cancel: 'Cancel', error: 'Could not save all changes. Please try again.',
  deleteMessage: 'Delete this session and its conversation? Artworks will stay in your library.',
  deleting: 'Deleting session…',
  deleted: 'Session deleted. Artworks stayed in your library.',
  deleteError: 'Could not delete this session. Please try again.',
};
export function SessionActions({ session, userId, disabled, onSaved }: {
  session: SessionRecord; userId: string; disabled: boolean; onSaved: (session: SessionRecord) => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState('');
  const [goal, setGoal] = useState('');
  const [error, setError] = useState<string | null>(null);
  const edit = () => {
    setTitle(session.title);
    setGoal(typeof session.metadata?.user_goal === 'string' ? session.metadata.user_goal : '');
    setError(null); setEditing(true);
  };
  const save = async () => {
    if (busy || !title.trim()) return;
    setBusy(true); setError(null);
    try {
      onSaved(await mobileSessionManagement.save(session, userId, title, goal));
      setEditing(false);
    } catch { setError(COPY.error); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (busy) return;
    setBusy(true);
    showPendingToast({ label: COPY.deleting });
    try {
      await mobileSessionManagement.remove(session.id, userId);
      showToast({ label: COPY.deleted });
      router.replace('/');
    } catch { showToast({ label: COPY.deleteError, tone: 'danger', icon: 'exclamationmark' }); }
    finally { setBusy(false); }
  };
  return <>
    <Stack.Toolbar placement="right">
      <Stack.Toolbar.Menu icon="ellipsis" accessibilityLabel={COPY.actions} disabled={disabled || busy}>
        <Stack.Toolbar.MenuAction icon="pencil" onPress={edit}>{COPY.edit}</Stack.Toolbar.MenuAction>
        <Stack.Toolbar.MenuAction icon="trash" destructive onPress={() => Alert.alert(COPY.remove, COPY.deleteMessage, [
          { text: COPY.cancel, style: 'cancel' },
          { text: COPY.remove, style: 'destructive', onPress: () => void remove() },
        ])}>{COPY.remove}</Stack.Toolbar.MenuAction>
      </Stack.Toolbar.Menu>
    </Stack.Toolbar>
    <Modal visible={editing} presentationStyle="pageSheet" animationType="slide" onRequestClose={() => { if (!busy) setEditing(false); }}>
      <SafeAreaView style={styles.screen}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <KeyboardScrollView contentContainerStyle={styles.content}>
            <Text style={styles.heading}>{COPY.details}</Text>
            <MuseeTextField label={COPY.name} value={title} onChangeText={setTitle} editable={!busy} autoCapitalize="sentences" />
            <MuseeTextField label={COPY.goal} value={goal} onChangeText={setGoal} editable={!busy}
              multiline placeholder={COPY.placeholder} autoCapitalize="sentences" style={styles.goal} />
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            <View style={styles.actions}>
              <MuseeButton label={COPY.cancel} variant="secondary" disabled={busy} onPress={() => setEditing(false)} />
              <MuseeButton label={COPY.save} loading={busy} disabled={!title.trim()} onPress={() => void save()} />
            </View>
          </KeyboardScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  </>;
}
const styles = StyleSheet.create({
  flex: { flex: 1 }, screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg },
  heading: { color: colors.foreground, fontSize: typography.heading, fontWeight: '600' },
  goal: { minHeight: 140, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', gap: spacing.md }, error: { color: colors.danger },
});
