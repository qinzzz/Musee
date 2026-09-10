import { useRouter } from 'expo-router';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../../auth/AuthProvider';
import { MuseeButton } from '../../../ui/components/MuseeButton';
import { Screen } from '../../../ui/components/Screen';
import { colors, spacing, typography } from '../../../ui/tokens/theme';
import { useJournals } from '../../../journals/useJournals';
import { formatJournalDate } from '../../../journals/journalPresentation';
import { usePullToRefresh } from '../../../ui/hooks/usePullToRefresh';
import { LoadingIndicator } from '../../../ui/components/LoadingIndicator';
import { JournalArtworkImages } from '../../../journals/JournalArtworkImages';
import { GlassIconButton } from '../../../ui/components/GlassIconButton';

const COPY = {
  title: 'Profile',
  journal: 'Journal',
  timing: 'Your journal appears here overnight.',
  empty: 'No journal entries yet. Explore art in a Session, then check back tomorrow.',
  loadError: 'Musee could not load your journal. Please try again.',
  refreshError: 'Musee could not refresh your journal. Your saved entries are still shown.',
  retry: 'Try again',
  settings: 'Settings',
} as const;

export default function ProfileScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const journals = useJournals(user?.user_id ?? '');
  const pullToRefresh = usePullToRefresh(() => journals.refetch());

  return (
    <Screen contentStyle={styles.screen}>
      <View style={styles.toolbar}>
        <Text accessibilityRole="header" style={styles.title}>{COPY.title}</Text>
        <GlassIconButton icon="gearshape" label={COPY.settings} onPress={() => router.push('/settings')} />
      </View>
      <FlatList
        data={journals.data ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        {...pullToRefresh}
        ListHeaderComponent={<View style={styles.header}>
        <View style={styles.journalHeading}>
          <Text accessibilityRole="header" style={styles.title}>{COPY.journal}</Text>
          <Text style={styles.message}>{COPY.timing}</Text>
        </View>
        {journals.isError ? <View style={styles.feedback}>
          <Text accessibilityLiveRegion="polite" style={styles.error}>
            {journals.data?.length ? COPY.refreshError : COPY.loadError}
          </Text>
          <MuseeButton label={COPY.retry} loading={journals.isFetching}
            onPress={() => void journals.refetch()} variant="secondary" />
        </View> : null}
        </View>}
        ListEmptyComponent={journals.isPending ? <LoadingIndicator /> : !journals.isError ?
          <Text style={styles.message}>{COPY.empty}</Text> : null}
        renderItem={({ item }) => <View style={styles.entry}>
          <Text style={styles.date}>{formatJournalDate(item.local_date)}</Text>
          <Text selectable style={styles.reflection}>{item.reflection}</Text>
          <JournalArtworkImages artworks={item.representative_artworks ?? []} />
        </View>}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
  toolbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.sm },
  content: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: 112 },
  header: { gap: spacing.md, paddingBottom: spacing.lg },
  title: { color: colors.foreground, fontSize: typography.heading, fontWeight: '600' },
  journalHeading: { gap: spacing.sm },
  message: { color: colors.secondary, fontSize: typography.body, lineHeight: 24 },
  error: { color: colors.danger, fontSize: typography.caption },
  feedback: { gap: spacing.sm },
  entry: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
    paddingVertical: spacing.lg, gap: spacing.sm },
  date: { color: colors.secondary, fontSize: typography.caption, fontWeight: '500' },
  reflection: { color: colors.foreground, fontSize: typography.body, lineHeight: 28 },
});
