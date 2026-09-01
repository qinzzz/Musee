import { StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../../auth/AuthProvider';
import { MuseeButton } from '../../ui/components/MuseeButton';
import { Screen } from '../../ui/components/Screen';
import { colors, radii, spacing, typography } from '../../ui/tokens/theme';

const COPY = {
  brand: 'Musee',
  heading: 'You are signed in',
  message: 'The native authentication flow is ready for the next product slice.',
  accountLabel: 'Account',
  fallbackAccount: 'Musee account',
  logout: 'Sign out',
} as const;

export default function AuthenticatedHomeScreen() {
  const { logout, user } = useAuth();
  const accountName = user?.email || user?.full_name || user?.username || COPY.fallbackAccount;

  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.brand}>{COPY.brand}</Text>
        <Text style={styles.heading}>{COPY.heading}</Text>
        <Text style={styles.message}>{COPY.message}</Text>
      </View>

      <View style={styles.accountCard}>
        <Text style={styles.accountLabel}>{COPY.accountLabel}</Text>
        <Text style={styles.accountName}>{accountName}</Text>
      </View>

      <MuseeButton
        label={COPY.logout}
        onPress={() => void logout()}
        variant="secondary"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    justifyContent: 'center',
    gap: spacing.xl,
  },
  header: {
    gap: spacing.sm,
  },
  brand: {
    color: colors.foreground,
    fontSize: typography.title,
    fontWeight: '600',
    letterSpacing: -1,
    marginBottom: spacing.md,
  },
  heading: {
    color: colors.foreground,
    fontSize: typography.heading,
    fontWeight: '600',
  },
  message: {
    color: colors.secondary,
    fontSize: typography.body,
    lineHeight: 24,
  },
  accountCard: {
    gap: spacing.xs,
    borderColor: colors.border,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  accountLabel: {
    color: colors.secondary,
    fontSize: typography.caption,
  },
  accountName: {
    color: colors.foreground,
    fontSize: typography.body,
    fontWeight: '500',
  },
});
