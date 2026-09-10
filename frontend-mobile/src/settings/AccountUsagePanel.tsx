import { getMeteredQuotas, type AccountUsage } from '@musee/client-core';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../ui/tokens/theme';
import { USAGE_LABELS, usageFraction, usageStatus } from './usagePresentation';

const UNLIMITED_LABEL = 'Unlimited plan';
const WARNING_COLOR = '#946200';

export function AccountUsagePanel({ usage }: { usage: AccountUsage }) {
  const metered = getMeteredQuotas(usage);
  if (!metered.length) return <Text style={styles.label}>{UNLIMITED_LABEL}</Text>;
  return <View style={styles.meters}>
    {metered.map(([key, entry]) => {
      const label = USAGE_LABELS[key] || key;
      const amount = `${entry.used.toLocaleString()} / ${entry.limit!.toLocaleString()}`;
      const color = entry.exceeded ? colors.danger : entry.warning ? WARNING_COLOR : colors.foreground;
      const status = usageStatus(entry);
      return <View key={key} style={styles.meter}>
        <View style={styles.row}>
          <Text style={styles.label}>{label}</Text>
          <Text style={[styles.amount, { color }]}>{amount}</Text>
        </View>
        <View accessible accessibilityRole="progressbar" accessibilityLabel={label}
          accessibilityValue={{ text: `${amount}${status ? `. ${status}` : ''}` }} style={styles.track}>
          <View style={[styles.fill, { backgroundColor: color, width: `${usageFraction(entry) * 100}%` }]} />
        </View>
        {status ? <Text style={[styles.status, { color }]}>{status}</Text> : null}
      </View>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  meters: { gap: spacing.lg },
  meter: { gap: spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.xs },
  label: { color: colors.foreground, fontSize: typography.body },
  amount: { fontSize: typography.label, fontWeight: '600' },
  track: { height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  status: { fontSize: typography.caption, lineHeight: 20 },
});
