import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { colors, spacing } from '../tokens/theme';

type ScreenProps = PropsWithChildren<{
  contentStyle?: ViewStyle;
  edges?: Edge[];
}>;

export function Screen({ children, contentStyle, edges }: ScreenProps) {
  return (
    <View style={styles.background}>
      <SafeAreaView edges={edges} style={[styles.content, contentStyle]}>{children}</SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
});
