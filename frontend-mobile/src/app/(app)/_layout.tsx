import { Stack } from 'expo-router';

import { CaptureDraftProvider } from '../../capture/CaptureDraftProvider';
import { colors } from '../../ui/tokens/theme';

export default function AppLayout() {
  return (
    <CaptureDraftProvider>
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
        <Stack.Screen
          name="camera"
          options={{ headerShown: false, presentation: 'fullScreenModal' }}
        />
        <Stack.Screen name="artwork/[id]" options={{ title: 'Artwork' }} />
        <Stack.Screen name="session/[id]" options={{ title: 'Session' }} />
      </Stack>
    </CaptureDraftProvider>
  );
}
