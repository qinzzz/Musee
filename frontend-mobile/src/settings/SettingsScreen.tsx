import { useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { Screen } from '../ui/components/Screen';
import { MuseeButton } from '../ui/components/MuseeButton';
import { LoadingIndicator } from '../ui/components/LoadingIndicator';
import { usePullToRefresh } from '../ui/hooks/usePullToRefresh';
import { colors, spacing, typography } from '../ui/tokens/theme';
import { AccountUsagePanel } from './AccountUsagePanel';
import { useAccountUsage } from './useAccountUsage';

const COPY = {
  account: 'Account', usage: 'Usage', signOut: 'Sign out', retry: 'Try again',
  loadError: 'Musee could not load your usage. Please try again.',
  refreshError: 'Musee could not refresh your usage. Previously loaded usage is shown.',
  signOutError: 'Musee could not finish signing out. Please try again.',
} as const;

export function SettingsScreen() {
  const { user, logout } = useAuth();
  const query = useAccountUsage(user?.user_id ?? '');
  const refresh = usePullToRefresh(() => query.refetch());
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  async function signOut() {
    if (inFlight.current) return;
    inFlight.current = true;
    setSigningOut(true);
    setError(null);
    try { await logout(); }
    catch { setError(COPY.signOutError); }
    finally { inFlight.current = false; setSigningOut(false); }
  }
  return <Screen edges={['left', 'right', 'bottom']} contentStyle={styles.screen}>
    <ScrollView contentContainerStyle={styles.content}
      refreshControl={<RefreshControl {...refresh} />}>
      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.heading}>{COPY.account}</Text>
        {user?.email ? <Text selectable style={styles.text}>{user.email}</Text> : null}
      </View>
      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.heading}>{COPY.usage}</Text>
        {query.isPending ? <LoadingIndicator /> : null}
        {query.isError ? <View style={styles.feedback}>
          <Text accessibilityLiveRegion="polite" style={styles.error}>{query.data ? COPY.refreshError : COPY.loadError}</Text>
          <MuseeButton label={COPY.retry} variant="secondary" loading={query.isFetching} onPress={() => void query.refetch()} />
        </View> : null}
        {query.data ? <AccountUsagePanel usage={query.data} /> : null}
      </View>
      <MuseeButton label={COPY.signOut} variant="secondary" loading={signingOut} onPress={() => void signOut()} />
      {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
    </ScrollView>
  </Screen>;
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
  content: { padding: spacing.lg, gap: spacing.xl },
  section: { gap: spacing.md },
  heading: { fontSize: typography.heading, fontWeight: '600', color: colors.foreground },
  text: { fontSize: typography.body, color: colors.secondary },
  feedback: { gap: spacing.sm },
  error: { fontSize: typography.caption, color: colors.danger },
});
