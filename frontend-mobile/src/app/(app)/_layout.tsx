import { Stack } from 'expo-router';

import { colors } from '../../ui/tokens/theme';

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: colors.background },
        headerBackTitle: 'Library',
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.foreground,
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="artwork/[id]" options={{ title: 'Artwork' }} />
    </Stack>
  );
}
