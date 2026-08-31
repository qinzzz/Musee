import { CLIENT_CORE_VERSION } from '@musee/client-core';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const APP_TITLE = 'Musee';
const SCAFFOLD_MESSAGE = 'Native iOS foundation';
const CORE_VERSION_LABEL = `Client core ${CLIENT_CORE_VERSION}`;

const COLORS = {
  background: '#F5F2EA',
  foreground: '#171717',
  secondary: '#69645C',
} as const;

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Text style={styles.title}>{APP_TITLE}</Text>
        <Text style={styles.message}>{SCAFFOLD_MESSAGE}</Text>
        <Text style={styles.version}>{CORE_VERSION_LABEL}</Text>
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
});
