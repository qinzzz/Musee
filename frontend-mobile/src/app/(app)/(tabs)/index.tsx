import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../../../auth/AuthProvider';
import { HomeSessionPanel } from '../../../session/components/HomeSessionPanel';
import { MuseeButton } from '../../../ui/components/MuseeButton';
import { Screen } from '../../../ui/components/Screen';
import { colors, spacing, typography } from '../../../ui/tokens/theme';

const COPY = {
  brand: 'Musee',
  signOut: 'Sign out',
} as const;

export default function AuthenticatedHomeScreen() {
  const { logout } = useAuth();

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.brand}>{COPY.brand}</Text>
        <HomeSessionPanel />
        <View style={styles.footer}>
          <MuseeButton
            label={COPY.signOut}
            onPress={() => void logout()}
            variant="secondary"
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    gap: spacing.xl,
    paddingBottom: spacing.xl,
    paddingTop: spacing.xxl,
  },
  brand: {
    color: colors.foreground,
    fontSize: typography.title,
    fontWeight: '600',
    letterSpacing: -1,
  },
  footer: {
    marginTop: 'auto',
    paddingTop: spacing.lg,
  },
});
