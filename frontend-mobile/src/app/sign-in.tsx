import { useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from 'react-native';

import { MOBILE_API_BASE_URL } from '../api/runtime';
import { useAuth } from '../auth/AuthProvider';
import {
  presentAuthError,
  type AuthErrorPresentation,
} from '../auth/authErrorPresentation';
import { MuseeButton } from '../ui/components/MuseeButton';
import { MuseeTextField } from '../ui/components/MuseeTextField';
import { Screen } from '../ui/components/Screen';
import { colors, spacing, typography } from '../ui/tokens/theme';

const COPY = {
  title: 'Musee',
  heading: 'Welcome back',
  message: 'Sign in to keep your artwork history and collections with you.',
  emailLabel: 'Email',
  emailPlaceholder: 'you@example.com',
  passwordLabel: 'Password',
  passwordPlaceholder: 'Enter your password',
  submit: 'Sign in',
  missingFields: 'Enter both your email and password.',
} as const;

export default function SignInScreen() {
  const { loginWithEmail, status } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<AuthErrorPresentation | null>(null);
  const isSigningIn = status === 'signingIn';

  const handleSubmit = async () => {
    const normalizedEmail = email.trim();
    if (!normalizedEmail || !password) {
      setError({ message: COPY.missingFields });
      return;
    }

    Keyboard.dismiss();
    setError(null);
    try {
      await loginWithEmail(normalizedEmail, password);
    } catch (loginError) {
      setError(presentAuthError(loginError, {
        apiBaseUrl: MOBILE_API_BASE_URL,
        showTechnicalDetails: __DEV__,
      }));
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <TouchableWithoutFeedback accessible={false} onPress={Keyboard.dismiss}>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.header}>
              <Text style={styles.brand}>{COPY.title}</Text>
              <Text style={styles.heading}>{COPY.heading}</Text>
              <Text style={styles.message}>{COPY.message}</Text>
            </View>

            <View style={styles.form}>
              <MuseeTextField
                autoComplete="email"
                keyboardType="email-address"
                label={COPY.emailLabel}
                onChangeText={setEmail}
                placeholder={COPY.emailPlaceholder}
                returnKeyType="next"
                textContentType="emailAddress"
                value={email}
              />
              <MuseeTextField
                autoComplete="current-password"
                label={COPY.passwordLabel}
                onChangeText={setPassword}
                onSubmitEditing={() => void handleSubmit()}
                placeholder={COPY.passwordPlaceholder}
                returnKeyType="done"
                secureTextEntry
                textContentType="password"
                value={password}
              />
              {error ? (
                <View accessibilityLiveRegion="polite" style={styles.errorGroup}>
                  <Text style={styles.error}>{error.message}</Text>
                  {error.technicalDetail ? (
                    <Text style={styles.errorDetail}>{error.technicalDetail}</Text>
                  ) : null}
                </View>
              ) : null}
              <MuseeButton
                label={COPY.submit}
                loading={isSigningIn}
                onPress={() => void handleSubmit()}
              />
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: spacing.xl,
    paddingVertical: spacing.xxl,
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
  form: {
    gap: spacing.md,
  },
  error: {
    color: colors.danger,
    fontSize: typography.caption,
    lineHeight: 19,
  },
  errorDetail: {
    color: colors.secondary,
    fontSize: typography.caption,
    lineHeight: 19,
  },
  errorGroup: {
    gap: spacing.xs,
  },
});
