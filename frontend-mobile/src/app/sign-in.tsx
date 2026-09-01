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

import { useAuth } from '../auth/AuthProvider';
import { MobileAuthHttpError } from '../auth/mobileAuthTransport';
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
  genericError: 'Something went wrong. Please try again.',
} as const;

const ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: 'Incorrect email or password.',
  email_unverified: 'Check your inbox and verify your email before signing in.',
  password_not_set: 'This account uses Google sign-in and does not have a password yet.',
  rate_limited: 'Too many attempts. Wait a minute and try again.',
};

function messageForError(error: unknown): string {
  if (error instanceof MobileAuthHttpError && error.code) {
    return ERROR_MESSAGES[error.code] ?? COPY.genericError;
  }
  return COPY.genericError;
}

export default function SignInScreen() {
  const { loginWithEmail, status } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const isSigningIn = status === 'signingIn';

  const handleSubmit = async () => {
    const normalizedEmail = email.trim();
    if (!normalizedEmail || !password) {
      setError(COPY.missingFields);
      return;
    }

    Keyboard.dismiss();
    setError(null);
    try {
      await loginWithEmail(normalizedEmail, password);
    } catch (loginError) {
      setError(messageForError(loginError));
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
                <Text accessibilityLiveRegion="polite" style={styles.error}>
                  {error}
                </Text>
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
});
