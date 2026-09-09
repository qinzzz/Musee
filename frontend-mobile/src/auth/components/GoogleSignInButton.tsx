import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text } from 'react-native';

const LABEL = 'Sign in with Google';
const GOOGLE_LOGO = require('../../../assets/auth/google-logo.png');

export function GoogleSignInButton({ disabled, onPress }: { disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityLabel={LABEL}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <Image source={GOOGLE_LOGO} contentFit="contain" style={styles.logo} accessible={false} />
      <Text style={styles.label}>{LABEL}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: '100%',
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#747775',
    backgroundColor: '#FFFFFF',
  },
  logo: { width: 20, height: 20 },
  label: { color: '#1F1F1F', fontSize: 16, fontWeight: '500', flexShrink: 1, textAlign: 'center' },
  pressed: { backgroundColor: '#F2F2F2' },
  disabled: { opacity: 0.5 },
});
