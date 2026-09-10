import type { AccountUsage } from '@musee/client-core';
import { StyleSheet, Text, View } from 'react-native';
import type { MobileAuthUser } from '../auth/mobileAuthTransport';
import { colors, spacing, typography } from '../ui/tokens/theme';

const COPY = {
  name: 'Display name', email: 'Email', plan: 'Plan', storage: 'Artwork storage',
  missing: 'Not provided', loading: 'Loading…', unavailable: 'Unavailable',
  free: 'Free', unlimited: 'Unlimited',
} as const;

export function AccountInfo({ user, usage, loading }: {
  user: MobileAuthUser | null; usage?: AccountUsage; loading: boolean;
}) {
  const pending = loading ? COPY.loading : COPY.unavailable;
  const stored = usage?.quotas.stored_artworks;
  const storage = stored
    ? stored.limit === null
      ? `${stored.used.toLocaleString()} artworks · unlimited`
      : `${stored.used.toLocaleString()} / ${stored.limit.toLocaleString()} artworks`
    : pending;
  const tier = usage?.tier;
  const plan = tier === 'free' ? COPY.free : tier === 'unlimited' ? COPY.unlimited : tier || pending;
  const rows = [
    { label: COPY.name, value: user?.full_name?.trim() || COPY.missing },
    { label: COPY.email, value: user?.email?.trim() || COPY.missing },
    { label: COPY.plan, value: plan },
    { label: COPY.storage, value: storage },
  ];
  return <View style={styles.card}>
    {rows.map((row, index) => <View key={row.label} style={[styles.row, index > 0 && styles.divider]}>
      <Text style={styles.label}>{row.label}</Text>
      <Text selectable style={styles.value}>{row.value}</Text>
    </View>)}
  </View>;
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: 16,
    paddingHorizontal: spacing.md },
  row: { paddingVertical: spacing.md, gap: spacing.xs },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  label: { fontSize: typography.caption, color: colors.secondary },
  value: { fontSize: typography.body, color: colors.foreground },
});
