import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../../ui/components/Screen';
import { colors, spacing, typography } from '../../../ui/tokens/theme';
const COPY = { title: 'Profile', message: 'Your journal, taste insights, and settings will live here.' };
export default function ProfileScreen() {
  return <Screen><View style={styles.content}>
    <Text style={styles.title}>{COPY.title}</Text><Text style={styles.message}>{COPY.message}</Text>
  </View></Screen>;
}
const styles = StyleSheet.create({
  content: { flex: 1, justifyContent: 'center', gap: spacing.md, paddingBottom: 96 },
  title: { color: colors.foreground, fontSize: typography.heading, textAlign: 'center', fontWeight: '600' },
  message: { color: colors.secondary, fontSize: typography.body, textAlign: 'center', lineHeight: 24 },
});
