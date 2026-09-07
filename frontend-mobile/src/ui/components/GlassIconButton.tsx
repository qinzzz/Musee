import { Pressable, StyleSheet } from 'react-native';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { GlassSurface } from './GlassSurface';
import { colors } from '../tokens/theme';

export function GlassIconButton({ icon, label, onPress, disabled }: {
  icon: SymbolViewProps['name']; label: string; onPress: () => void; disabled?: boolean;
}) {
  return <GlassSurface><Pressable accessibilityRole="button" accessibilityLabel={label}
    accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, (pressed || disabled) && styles.dimmed]}>
    <SymbolView name={icon} tintColor={colors.foreground} size={21} />
  </Pressable></GlassSurface>;
}
const styles = StyleSheet.create({
  button: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  dimmed: { opacity: 0.45 },
});
