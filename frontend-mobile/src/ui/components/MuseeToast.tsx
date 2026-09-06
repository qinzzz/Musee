import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';

import { subscribeToast, type ToastState } from '../toast';
import { colors, spacing, typography } from '../tokens/theme';

const HIDDEN_STATE: ToastState = {
  label: '',
  icon: 'checkmark',
  loading: false,
  tone: 'success',
  visible: false,
};

const iconBackground = {
  success: colors.success,
  neutral: colors.foreground,
  danger: colors.danger,
} as const;

function ToastContent({ toast }: { toast: ToastState }) {
  return (
    <View style={styles.content}>
      <View style={[styles.icon, { backgroundColor: iconBackground[toast.tone] }]}>
        {toast.loading ? (
          <ActivityIndicator color={colors.onPrimary} size="small" />
        ) : (
          <SymbolView
            accessible={false}
            fallback={<Text style={styles.iconFallback}>•</Text>}
            name={toast.icon}
            size={15}
            tintColor={colors.onPrimary}
            weight="semibold"
          />
        )}
      </View>
      <Text accessibilityRole="alert" numberOfLines={2} style={styles.label}>
        {toast.label}
      </Text>
    </View>
  );
}

export function MuseeToast() {
  const [toast, setToast] = useState<ToastState>(HIDDEN_STATE);

  useEffect(() => subscribeToast(setToast), []);

  if (!toast.visible) return null;

  const canUseLiquidGlass = Platform.OS === 'ios'
    && isGlassEffectAPIAvailable()
    && isLiquidGlassAvailable();
  const content = <ToastContent toast={toast} />;

  return (
    <View pointerEvents="none" style={styles.host}>
      <View style={styles.shadow}>
        {canUseLiquidGlass ? (
          <>
            <GlassView
              colorScheme="light"
              glassEffectStyle={{ style: 'regular', animate: true, animationDuration: 0.2 }}
              style={styles.glass}
              tintColor="rgba(245, 242, 234, 0.18)"
            />
            {content}
          </>
        ) : (
          <View style={styles.fallback}>{content}</View>
        )}
      </View>
    </View>
  );
}

const surface = {
  borderColor: 'rgba(255, 255, 255, 0.72)',
  borderRadius: 27,
  borderWidth: StyleSheet.hairlineWidth,
} as const;

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    top: 58,
    left: 0,
    right: 0,
    zIndex: 1000,
    alignItems: 'center',
  },
  shadow: {
    width: '88%',
    minHeight: 54,
    borderRadius: 27,
    shadowColor: colors.foreground,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
  },
  glass: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    ...surface,
    overflow: 'hidden',
  },
  fallback: {
    ...surface,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
  },
  content: {
    minHeight: 54,
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  icon: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: colors.success,
  },
  iconFallback: {
    color: colors.onPrimary,
    fontSize: typography.label,
    fontWeight: '700',
  },
  label: {
    flex: 1,
    color: colors.foreground,
    fontSize: typography.label,
    fontWeight: '600',
    lineHeight: 20,
  },
});
