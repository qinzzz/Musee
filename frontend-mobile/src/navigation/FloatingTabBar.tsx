import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Keyboard, Pressable, StyleSheet, View } from 'react-native';
import { useEffect, useState } from 'react';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { GlassSurface } from '../ui/components/GlassSurface';
import { colors } from '../ui/tokens/theme';

const TABS: Record<string, { label: string; icon: SymbolViewProps['name'] }> = {
  index: { label: 'Home', icon: 'house' },
  library: { label: 'Collection', icon: 'square.grid.2x2' },
  profile: { label: 'Profile', icon: 'person.crop.circle' },
};
export const TAB_CONTENT_BOTTOM = 96;
export function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardWillShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardWillHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  if (keyboardVisible) return null;
  return <View pointerEvents="box-none" style={[styles.host, { bottom: Math.max(insets.bottom, 12) + 8 }]}>
    <GlassSurface style={styles.capsule}>
      {state.routes.map((route, index) => {
        const tab = TABS[route.name];
        if (!tab) return null;
        const selected = state.index === index;
        return <Pressable key={route.key} accessibilityRole="tab" accessibilityLabel={tab.label}
          accessibilityState={{ selected }} style={({ pressed }) => [styles.tab, selected && styles.selected, pressed && styles.pressed]}
          onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
          onPress={() => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!selected && !event.defaultPrevented) navigation.navigate(route.name, route.params);
          }}>
          <SymbolView name={tab.icon} size={23} tintColor={selected ? colors.foreground : colors.secondary} />
        </Pressable>;
      })}
    </GlassSurface>
  </View>;
}
const styles = StyleSheet.create({
  host: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  capsule: { flexDirection: 'row', padding: 6, gap: 8 },
  tab: { width: 68, height: 48, borderRadius: 9999, alignItems: 'center', justifyContent: 'center' },
  selected: { backgroundColor: 'rgba(0,0,0,0.07)' },
  pressed: { opacity: 0.5 },
});
