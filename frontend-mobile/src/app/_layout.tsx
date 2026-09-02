import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { MOBILE_API_BASE_URL } from '../api/runtime';
import { AuthProvider, useAuth } from '../auth/AuthProvider';
import { presentAuthError } from '../auth/authErrorPresentation';
import { MuseeButton } from '../ui/components/MuseeButton';
import { colors, spacing, typography } from '../ui/tokens/theme';

const RESTORE_ERROR_TITLE = 'Musee could not start your session';
const RETRY_LABEL = 'Try again';

function AuthenticatedStack() {
  const { restoreError, retryRestore, status } = useAuth();

  if (status === 'restoring') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.foreground} />
      </View>
    );
  }

  if (status === 'error') {
    const error = presentAuthError(restoreError, {
      apiBaseUrl: MOBILE_API_BASE_URL,
      showTechnicalDetails: __DEV__,
    });
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>{RESTORE_ERROR_TITLE}</Text>
        <Text style={styles.errorMessage}>{error.message}</Text>
        <Text style={styles.errorReassurance}>
          Your saved sign-in has not been removed.
        </Text>
        {error.technicalDetail ? (
          <Text style={styles.errorDetail}>{error.technicalDetail}</Text>
        ) : null}
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
  errorReassurance: {
    color: colors.secondary,
    fontSize: typography.caption,
    lineHeight: 19,
  },
  errorDetail: {
    color: colors.secondary,
    fontSize: typography.caption,
    lineHeight: 19,
  },
});
