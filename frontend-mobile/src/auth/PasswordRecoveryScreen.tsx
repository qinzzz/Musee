import { useRouter } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MuseeButton } from '../ui/components/MuseeButton';
import { MuseeTextField } from '../ui/components/MuseeTextField';
import { Screen } from '../ui/components/Screen';
import { colors, spacing, typography } from '../ui/tokens/theme';
import { usePasswordRecovery } from './usePasswordRecovery';

const COPY = {
  title: 'Reset your password',
  description: 'Enter your account email and we’ll send you a password reset link.',
  email: 'Email', placeholder: 'you@example.com', send: 'Send reset link',
  sent: 'Check your inbox',
  confirmation: 'If an account exists for this email, you’ll receive a link to reset your password. Check your spam folder too.',
  next: 'Open the link in your browser and choose a new password. Then return to Musee and sign in with it.',
  latest: 'Reset links expire after 30 minutes. If you request another, use the newest email.',
  resend: 'Resend email', changeEmail: 'Change email', back: 'Back to sign in',
  resendCountdown: (seconds: number) => `Resend in ${seconds}s`,
  sendCountdown: (seconds: number) => `Try again in ${seconds}s`,
} as const;

export function PasswordRecoveryScreen() {
  const router = useRouter();
  const recovery = usePasswordRecovery();
  return <Screen>
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <Text accessibilityRole="header" style={styles.heading}>{recovery.sent ? COPY.sent : COPY.title}</Text>
        {recovery.sent ? <View style={styles.group}>
          <Text accessibilityLiveRegion="polite" style={styles.text}>{COPY.confirmation}</Text>
          <Text style={styles.text}>{COPY.next}</Text>
          <Text style={styles.hint}>{COPY.latest}</Text>
          {recovery.error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{recovery.error}</Text> : null}
          <MuseeButton label={recovery.remainingSeconds > 0 ? COPY.resendCountdown(recovery.remainingSeconds) : COPY.resend}
            disabled={recovery.remainingSeconds > 0} loading={recovery.sending}
            onPress={() => void recovery.submit()} />
          <MuseeButton label={COPY.changeEmail} variant="secondary" disabled={recovery.sending} onPress={recovery.editEmail} />
        </View> : <View style={styles.group}>
          <Text style={styles.text}>{COPY.description}</Text>
          <MuseeTextField label={COPY.email} placeholder={COPY.placeholder} value={recovery.email}
            onChangeText={recovery.setEmail} editable={!recovery.sending} keyboardType="email-address"
            autoComplete="email" textContentType="emailAddress" returnKeyType="send"
            onSubmitEditing={() => void recovery.submit()} />
          {recovery.error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{recovery.error}</Text> : null}
          <MuseeButton label={recovery.remainingSeconds > 0 ? COPY.sendCountdown(recovery.remainingSeconds) : COPY.send}
            disabled={recovery.remainingSeconds > 0} loading={recovery.sending} onPress={() => void recovery.submit()} />
        </View>}
        <MuseeButton label={COPY.back} variant="secondary" onPress={() => router.replace('/sign-in')} />
      </ScrollView>
    </KeyboardAvoidingView>
  </Screen>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, alignSelf: 'center', width: '100%', maxWidth: 440,
    paddingVertical: spacing.xxl, gap: spacing.lg },
  group: { gap: spacing.md },
  heading: { color: colors.foreground, fontSize: typography.title, fontWeight: '600' },
  text: { color: colors.secondary, fontSize: typography.body, lineHeight: 24 },
  hint: { color: colors.secondary, fontSize: typography.caption, lineHeight: 20 },
  error: { color: colors.danger, fontSize: typography.body },
});
