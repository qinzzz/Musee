import { useRouter } from 'expo-router';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../ui/components/Screen';
import { MuseeButton } from '../ui/components/MuseeButton';
import { MuseeTextField } from '../ui/components/MuseeTextField';
import { colors, spacing, typography } from '../ui/tokens/theme';
import { useEmailSignup } from './useEmailSignup';

const COPY = {
  title: 'Create your account', verify: 'Verify your email', inbox: 'Check your inbox',
  email: 'Email', emailPlaceholder: 'you@example.com', password: 'Password',
  passwordPlaceholder: 'At least 8 characters', confirm: 'Confirm password',
  submit: 'Create account', resend: 'Resend verification email', edit: 'Change details',
  back: 'Back to sign in',
  sent: 'We sent a verification link to',
  next: 'Open the link in your browser to verify your email. Then return to Musee and sign in.',
  hint: 'Check your spam folder too. Links expire after 24 hours; only the newest link works.',
  wait: (seconds: number) => `Try again in ${seconds}s`,
  resendWait: (seconds: number) => `Resend in ${seconds}s`,
} as const;

export function EmailSignupScreen() {
  const router = useRouter();
  const signup = useEmailSignup();
  const submit = () => { Keyboard.dismiss(); void signup.submit(); };
  return <Screen>
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <Text accessibilityRole="header" style={styles.title}>
          {signup.pendingVerification ? signup.emailSent ? COPY.inbox : COPY.verify : COPY.title}
        </Text>
        {signup.pendingVerification ? <View style={styles.group}>
          {signup.emailSent ? <Text style={styles.text}>{COPY.sent} {signup.email.trim()}.</Text> : null}
          <Text style={styles.text}>{COPY.next}</Text>
          <Text style={styles.hint}>{COPY.hint}</Text>
        </View> : <View style={styles.group}>
          <MuseeTextField label={COPY.email} placeholder={COPY.emailPlaceholder} value={signup.email}
            onChangeText={signup.setEmail} editable={!signup.sending} keyboardType="email-address"
            autoComplete="email" textContentType="emailAddress" />
          <MuseeTextField label={COPY.password} placeholder={COPY.passwordPlaceholder} value={signup.password}
            onChangeText={signup.setPassword} editable={!signup.sending} secureTextEntry
            autoComplete="new-password" textContentType="newPassword" />
          <MuseeTextField label={COPY.confirm} value={signup.confirmation} onChangeText={signup.setConfirmation}
            editable={!signup.sending} secureTextEntry autoComplete="new-password" textContentType="newPassword"
            returnKeyType="done" onSubmitEditing={submit} />
        </View>}
        {signup.error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{signup.error}</Text> : null}
        <MuseeButton label={signup.remainingSeconds > 0
          ? (signup.pendingVerification ? COPY.resendWait : COPY.wait)(signup.remainingSeconds)
          : signup.pendingVerification ? COPY.resend : COPY.submit}
          loading={signup.sending} disabled={signup.remainingSeconds > 0} onPress={submit} />
        {signup.pendingVerification ? <MuseeButton label={COPY.edit} variant="secondary"
          disabled={signup.sending} onPress={signup.edit} /> : null}
        <MuseeButton label={COPY.back} variant="secondary" onPress={() => router.replace('/sign-in')} />
      </ScrollView>
    </KeyboardAvoidingView>
  </Screen>;
}
const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, width: '100%', maxWidth: 440, alignSelf: 'center', paddingVertical: spacing.xxl, gap: spacing.lg },
  group: { gap: spacing.md },
  title: { color: colors.foreground, fontSize: typography.title, fontWeight: '600' },
  text: { color: colors.secondary, fontSize: typography.body, lineHeight: 24 },
  hint: { color: colors.secondary, fontSize: typography.caption, lineHeight: 20 },
  error: { color: colors.danger, fontSize: typography.body },
});
