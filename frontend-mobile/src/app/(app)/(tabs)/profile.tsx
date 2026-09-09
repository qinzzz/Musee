import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../../auth/AuthProvider';
import { MuseeButton } from '../../../ui/components/MuseeButton';
import { Screen } from '../../../ui/components/Screen';
import { colors, spacing, typography } from '../../../ui/tokens/theme';

const COPY = {
  title: 'Profile',
  message: 'Your journal, taste insights, and settings will live here.',
  signOut: 'Sign out',
  signOutError: 'Musee could not finish signing out. Please try again.',
} as const;

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const inFlight = useRef(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signOut = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSigningOut(true);
    setError(null);
    try {
      await logout();
    } catch {
      setError(COPY.signOutError);
    } finally {
      inFlight.current = false;
      setSigningOut(false);
    }
  };

  return (
    <Screen>
      <View style={styles.content}>
        <Text style={styles.title}>{COPY.title}</Text>
        {user?.email ? <Text selectable style={styles.account}>{user.email}</Text> : null}
        <Text style={styles.message}>{COPY.message}</Text>
        <MuseeButton label={COPY.signOut} loading={signingOut}
          onPress={() => void signOut()} variant="secondary" />
        {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, justifyContent: 'center', gap: spacing.md, paddingBottom: 96 },
  title: { color: colors.foreground, fontSize: typography.heading, textAlign: 'center', fontWeight: '600' },
  account: { color: colors.foreground, fontSize: typography.body, textAlign: 'center' },
  message: { color: colors.secondary, fontSize: typography.body, textAlign: 'center', lineHeight: 24 },
  error: { color: colors.danger, fontSize: typography.caption, textAlign: 'center' },
});
