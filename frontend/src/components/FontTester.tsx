import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';

export const FontTester = () => {
  const fonts = [
    { name: 'IBMPlexMono-Regular', file: 'IBMPlexMono-Regular.ttf', label: 'IBM Plex Mono Regular (PostScript)' },
    { name: 'IBMPlexMono-Bold', file: 'IBMPlexMono-Bold.ttf', label: 'IBM Plex Mono Bold (PostScript)' },
    { name: 'IBMPlexMono-SemiBold', file: 'IBMPlexMono-SemiBold.ttf', label: 'IBM Plex Mono SemiBold (PostScript)' },
    { name: 'IBM Plex Mono', file: 'IBMPlexMono', label: 'IBM Plex Mono (Family name)' },
    { name: 'UbuntuMono-Regular', file: 'UbuntuMono-Regular.ttf', label: 'Ubuntu Mono (PostScript)' },
    { name: 'Ubuntu Mono', file: 'UbuntuMono', label: 'Ubuntu Mono (Family name)' },
    { name: 'WhisperingSignature', file: 'WhisperingSignature.ttf', label: 'Whispering Signature' },
    { name: 'System Default', file: 'System', label: 'System Font' },
  ];

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.header}>Font Tester - If fonts are loaded, you'll see different styles</Text>
      {fonts.map((font, index) => (
        <View key={index} style={styles.fontRow}>
          <Text style={styles.label}>{font.name}:</Text>
          <Text
            style={[
              styles.testText,
              font.name !== 'System Default' && { fontFamily: font.name },
              font.weight && { fontWeight: font.weight as any },
            ]}
          >
            The quick brown fox jumps over the lazy dog 0123456789
          </Text>
          <Text style={styles.fileName}>({font.file})</Text>
        </View>
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: '#fff',
  },
  header: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#000',
  },
  fontRow: {
    marginBottom: 20,
    padding: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 5,
  },
  label: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#666',
    marginBottom: 5,
  },
  testText: {
    fontSize: 16,
    color: '#000',
    marginBottom: 5,
  },
  fileName: {
    fontSize: 10,
    color: '#999',
  },
});
