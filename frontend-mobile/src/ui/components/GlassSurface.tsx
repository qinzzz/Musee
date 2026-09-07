import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Platform, StyleSheet, View, type ViewStyle, type StyleProp } from 'react-native';
import type { PropsWithChildren } from 'react';

export function GlassSurface({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  const available = Platform.OS === 'ios' && isGlassEffectAPIAvailable() && isLiquidGlassAvailable();
  return <View style={[styles.surface, style]}>
    {available ? <GlassView colorScheme="light" glassEffectStyle="regular"
      tintColor="rgba(255,255,255,0.15)" style={styles.background} /> :
      <View style={[styles.background, styles.fallback]} />}
    {children}
  </View>;
}
const styles = StyleSheet.create({
  surface: { borderRadius: 9999, shadowColor: '#000', shadowOpacity: 0.08,
    shadowRadius: 16, shadowOffset: { width: 0, height: 5 } },
  background: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
    borderRadius: 9999, overflow: 'hidden' },
  fallback: { backgroundColor: 'rgba(255,255,255,0.96)', borderWidth: StyleSheet.hairlineWidth, borderColor: '#E5E5E5' },
});
