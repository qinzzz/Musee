import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { AuthProvider, useAuth } from '../auth/AuthProvider';
import { MuseeButton } from '../ui/components/MuseeButton';
import { colors, spacing, typography } from '../ui/tokens/theme';

const RESTORE_ERROR_TITLE = 'Musee could not start your session';
const RESTORE_ERROR_MESSAGE =
  'Check your connection and try again. Your saved sign-in has not been removed.';
const RETRY_LABEL = 'Try again';

function AuthenticatedStack() {
  const { retryRestore, status } = useAuth();

  if (status === 'restoring') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.foreground} />
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>{RESTORE_ERROR_TITLE}</Text>
        <Text style={styles.errorMessage}>{RESTORE_ERROR_MESSAGE}</Text>
        <MuseeButton label={RETRY_LABEL} onPress={() => void retryRestore()} />
      </View>
    );
  }

  const isAuthenticated = status === 'authenticated';

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!isAuthenticated}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
      <Stack.Protected guard={isAuthenticated}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <AuthenticatedStack />
      <StatusBar style="dark" />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.background,
  },
  errorTitle: {
    color: colors.foreground,
    fontSize: typography.heading,
    fontWeight: '600',
  },
  errorMessage: {
    color: colors.secondary,
    fontSize: typography.body,
    lineHeight: 24,
  },
});
