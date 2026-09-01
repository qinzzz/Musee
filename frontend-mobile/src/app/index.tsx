import { CLIENT_CORE_VERSION } from '@musee/client-core';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { checkBackendHealth } from '../api/runtime';

const APP_TITLE = 'Musee';
const SCAFFOLD_MESSAGE = 'Native iOS foundation';
const CORE_VERSION_LABEL = `Client core ${CLIENT_CORE_VERSION}`;
const BACKEND_STATUS_LABELS = {
  checking: 'Checking backend…',
  connected: 'Backend connected',
  unavailable: 'Backend unavailable',
} as const;

type BackendConnectionState = keyof typeof BACKEND_STATUS_LABELS;

const COLORS = {
  background: '#F5F2EA',
  foreground: '#171717',
  secondary: '#69645C',
  success: '#347454',
  warning: '#A14A36',
} as const;

export default function HomeScreen() {
  const [backendState, setBackendState] = useState<BackendConnectionState>('checking');

  useEffect(() => {
    let isActive = true;

    checkBackendHealth()
      .then(() => {
        if (isActive) setBackendState('connected');
      })
      .catch(() => {
        if (isActive) setBackendState('unavailable');
      });

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Text style={styles.title}>{APP_TITLE}</Text>
        <Text style={styles.message}>{SCAFFOLD_MESSAGE}</Text>
        <Text style={styles.version}>{CORE_VERSION_LABEL}</Text>
        <Text
          style={[
            styles.backendStatus,
            backendState === 'connected' && styles.backendConnected,
            backendState === 'unavailable' && styles.backendUnavailable,
          ]}
        >
          {BACKEND_STATUS_LABELS[backendState]}
        </Text>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  safeArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  title: {
    color: COLORS.foreground,
    fontSize: 40,
    fontWeight: '600',
    letterSpacing: -1,
  },
  message: {
    color: COLORS.secondary,
    fontSize: 17,
    marginTop: 12,
  },
  version: {
    color: COLORS.secondary,
    fontSize: 12,
    marginTop: 24,
  },
  backendStatus: {
    color: COLORS.secondary,
    fontSize: 13,
    marginTop: 10,
  },
  backendConnected: {
    color: COLORS.success,
  },
  backendUnavailable: {
    color: COLORS.warning,
  },
});
