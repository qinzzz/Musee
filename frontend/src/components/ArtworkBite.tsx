import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../constants/colors';
import { spacing, borderRadius } from '../constants/theme';

interface ArtworkBiteProps {
  content: string;
}

export const ArtworkBite: React.FC<ArtworkBiteProps> = ({ content }) => {
  return (
    <View style={styles.container}>
      <Text style={styles.content}>{content}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    padding: spacing.md,
    marginBottom: spacing.sm,
    width: '100%',
    borderWidth: 1,
    borderRadius: borderRadius.base,
    borderColor: colors.lightGrey,
  },
  content: {
    fontFamily: 'PP Neue Montreal',
    fontSize: 16,
    fontWeight: '400',
    color: colors.darkGrey,
    lineHeight: 22,
    letterSpacing: 0.32,
  },
});
