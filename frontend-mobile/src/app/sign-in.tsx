import { LoadingIndicator } from '../ui/components/LoadingIndicator';
import { GoogleSignInButton } from '../auth/components/GoogleSignInButton';
import { SymbolView } from 'expo-symbols';
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
  separator: 'Or continue with',
  signingIn: 'Signing in…',
  apple: 'Continue with Apple',
  comingSoon: 'Coming soon',
  missingFields: 'Enter both your email and password.',
} as const;

export default function SignInScreen() {
  const { loginWithEmail, loginWithGoogle, status } = useAuth();
  const [loginMethod, setLoginMethod] = useState<'email' | 'google' | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<AuthErrorPresentation | null>(null);
  const isSigningIn = status === 'signingIn';

  const handleSubmit = async () => {
    if (isSigningIn) return;
    const normalizedEmail = email.trim();
    if (!normalizedEmail || !password) {
      setError({ message: COPY.missingFields });
      return;
    }

    Keyboard.dismiss();
    setLoginMethod('email');
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

  const handleGoogleSignIn = async () => {
    if (isSigningIn) return;
    Keyboard.dismiss();
    setLoginMethod('google');
    setError(null);
    try {
      await loginWithGoogle();
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
                editable={!isSigningIn}
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
                editable={!isSigningIn}
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
              <MuseeButton
                label={COPY.submit}
                disabled={isSigningIn}
                loading={isSigningIn && loginMethod === 'email'}
                onPress={() => void handleSubmit()}
              />
            </View>

            <View style={styles.providers}>
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.separator}>{COPY.separator}</Text>
                <View style={styles.dividerLine} />
              </View>
              <GoogleSignInButton disabled={isSigningIn} onPress={() => void handleGoogleSignIn()} />
              <View accessible accessibilityRole="button"
                accessibilityLabel={`${COPY.apple}, ${COPY.comingSoon}`}
                accessibilityState={{ disabled: true }} style={styles.applePlaceholder}>
                <View style={styles.appleLabelRow}>
                  <SymbolView name="apple.logo" size={20} tintColor={colors.secondary} />
                  <Text style={styles.appleLabel}>{COPY.apple}</Text>
                </View>
                <Text style={styles.comingSoon}>{COPY.comingSoon}</Text>
              </View>
              {isSigningIn && loginMethod === 'google' ? (
                <View accessibilityLiveRegion="polite" style={styles.googleProgress}>
                  <LoadingIndicator color={colors.foreground} />
                  <Text style={styles.separator}>{COPY.signingIn}</Text>
                </View>
              ) : null}
            </View>
            {error ? (
              <View accessibilityLiveRegion="polite" style={styles.errorGroup}>
                <Text style={styles.error}>{error.message}</Text>
                {error.technicalDetail ? (
                  <Text style={styles.errorDetail}>{error.technicalDetail}</Text>
                ) : null}
              </View>
            ) : null}
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
    justifyContent: 'flex-start',
    alignSelf: 'center',
    width: '100%',
    maxWidth: 440,
    gap: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxl,
  },
  header: {
    gap: spacing.sm,
  },
  brand: {
    color: colors.foreground,
    fontSize: typography.body,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: spacing.lg,
  },
  heading: {
    color: colors.foreground,
    fontSize: typography.title,
    fontWeight: '600',
  },
  message: {
    color: colors.secondary,
    fontSize: typography.body,
    lineHeight: 24,
  },
  applePlaceholder: {
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
  },
  appleLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  appleLabel: { color: colors.secondary, fontSize: 16, fontWeight: '500' },
  comingSoon: { color: colors.secondary, fontSize: typography.caption },
  providers: { gap: spacing.lg, marginTop: spacing.sm },
  divider: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  googleProgress: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  separator: { color: colors.secondary, fontSize: typography.caption, textAlign: 'center' },
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
