import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing } from '../tokens/theme';

type ScreenProps = PropsWithChildren<{
  contentStyle?: ViewStyle;
}>;

export function Screen({ children, contentStyle }: ScreenProps) {
  return (
    <View style={styles.background}>
      <SafeAreaView style={[styles.content, contentStyle]}>{children}</SafeAreaView>
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
