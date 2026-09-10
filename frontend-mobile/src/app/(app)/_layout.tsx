import { Stack } from 'expo-router';
import { SessionDraftProvider } from '../../session/SessionDraftProvider';

import { CaptureDraftProvider } from '../../capture/CaptureDraftProvider';
import { colors } from '../../ui/tokens/theme';

export default function AppLayout() {
  return (
    <CaptureDraftProvider><SessionDraftProvider>
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: colors.background },
          headerBackButtonDisplayMode: 'minimal',
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
        <Stack.Screen name="artwork-upload" options={{ title: 'Add Artworks' }} />
        <Stack.Screen name="history" options={{ title: 'Sessions' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen name="museum/[id]" options={{ title: 'Museum' }} />
        <Stack.Screen name="artist/[id]" options={{ title: 'Artist' }} />
        <Stack.Screen name="boards/index" options={{ title: 'Boards' }} />
        <Stack.Screen name="boards/[id]" options={{ title: 'Board' }} />
        <Stack.Screen name="session/[id]" options={{ title: 'Session' }} />
      </Stack>
    </SessionDraftProvider></CaptureDraftProvider>
  );
}
