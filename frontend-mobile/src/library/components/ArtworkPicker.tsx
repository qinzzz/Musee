import { LoadingIndicator } from '../../ui/components/LoadingIndicator';
import { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ArtworkLibraryCard } from '../../library/components/ArtworkLibraryCard';
import type { MobileArtworkRecord } from '../../library/types';
import { MuseeButton } from '../../ui/components/MuseeButton';
import { colors, spacing, typography } from '../../ui/tokens/theme';
import { useArtworkPicker } from '../useArtworkPicker';

type ArtworkPickerProps = {
  excludedArtworkIds: string[];
  onCancel: () => void;
  onSelect: (artworks: MobileArtworkRecord[]) => void;
  remainingSlots?: number;
  disabled?: boolean;
  errorMessage?: string | null;
  requireAnalysisReady?: boolean;
  userId: string;
  visible: boolean;
};

const COPY = {
  empty: 'No saved artworks yet.',
  alreadyAdded: 'Already added',
  add: (count: number) => `Add ${count} artwork${count === 1 ? '' : 's'}`,
  retry: 'Try again',
  title: 'Choose from Library',
} as const;

export function ArtworkPicker({
  excludedArtworkIds,
  onCancel,
  onSelect,
  remainingSlots = Number.MAX_SAFE_INTEGER,
  disabled = false,
  errorMessage,
  requireAnalysisReady = false,
  userId,
  visible,
}: ArtworkPickerProps) {
  const [selected, setSelected] = useState<MobileArtworkRecord[]>([]);
  useEffect(() => { if (visible) setSelected([]); }, [visible]);
  const {
    error,
    isLoading,
    isLoadingMore,
    items,
    loadMore,
    reload,
  } = useArtworkPicker(userId, visible);
  const excludedIds = useMemo(
    () => new Set(excludedArtworkIds),
    [excludedArtworkIds],
  );
  const visibleItems = useMemo(
    () => items.filter((item) => !item.isDeleted),
    [items],
  );

  return (
    <Modal
      animationType="slide"
      onRequestClose={() => { if (!disabled) onCancel(); }}
      presentationStyle="pageSheet"
      visible={visible}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Text style={styles.title}>{COPY.title}</Text>
          <Pressable
            accessibilityRole="button"
            disabled={disabled}
            onPress={onCancel}
            style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
          >
            <Text style={styles.cancelLabel}>Cancel</Text>
          </Pressable>
        </View>
        <FlatList
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.content}
          data={visibleItems}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={isLoading ? (
            <LoadingIndicator color={colors.foreground} style={styles.loading} />
          ) : error ? (
            <View style={styles.messageBlock}>
              <Text style={styles.message}>{error.message}</Text>
              {error.technicalDetail ? (
                <Text style={styles.detail}>{error.technicalDetail}</Text>
              ) : null}
              <MuseeButton label={COPY.retry} onPress={() => void reload()} />
            </View>
          ) : (
            <Text style={styles.message}>{COPY.empty}</Text>
          )}
          ListFooterComponent={isLoadingMore ? (
            <LoadingIndicator color={colors.foreground} style={styles.footer} />
          ) : error && items.length > 0 ? (
            <View style={styles.messageBlock}>
              <Text style={styles.detail}>{error.message}</Text>
              <MuseeButton label={COPY.retry} onPress={() => void loadMore()} />
            </View>
          ) : null}
          numColumns={2}
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.4}
          renderItem={({ item }) => {
            const alreadyAdded = excludedIds.has(item.id);
            const isSelected = selected.some((entry) => entry.id === item.id);
            const isAnalyzing = item.analysisStatus === 'pending'
              || item.analysisStatus === 'analyzing';
            return (
              <View style={styles.item}>
                <ArtworkLibraryCard
                  artwork={item}
                  selected={alreadyAdded || isSelected}
                  disabled={disabled || alreadyAdded || (requireAnalysisReady && isAnalyzing) || (!isSelected && selected.length >= remainingSlots)}
                  onPress={() => setSelected((current) => current.some((entry) => entry.id === item.id)
                    ? current.filter((entry) => entry.id !== item.id) : current.length < remainingSlots ? [...current, item] : current)}
                  statusLabel={alreadyAdded ? COPY.alreadyAdded : undefined}
                />
              </View>
            );
          }}
          showsVerticalScrollIndicator={false}
        />
        {errorMessage ? <Text accessibilityRole="alert" style={styles.error}>{errorMessage}</Text> : null}
        <View style={styles.header}>
          <MuseeButton label={COPY.add(selected.length)}
            disabled={disabled || !selected.length} onPress={() => onSelect(selected)} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.background,
    flex: 1,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: {
    color: colors.foreground,
    fontSize: typography.heading,
    fontWeight: '600',
  },
  cancelButton: {
    justifyContent: 'center',
    minHeight: 44,
    paddingLeft: spacing.md,
  },
  cancelLabel: {
    color: colors.secondary,
    fontSize: typography.label,
    fontWeight: '600',
  },
  content: {
    flexGrow: 1,
    gap: spacing.md,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  row: {
    gap: spacing.md,
  },
  item: {
    flex: 1,
    maxWidth: '48%',
  },
  loading: {
    marginTop: spacing.xxl,
  },
  footer: {
    paddingVertical: spacing.lg,
  },
  messageBlock: {
    gap: spacing.md,
    paddingVertical: spacing.xxl,
  },
  message: {
    color: colors.foreground,
    fontSize: typography.body,
    lineHeight: 24,
    paddingVertical: spacing.xxl,
    textAlign: 'center',
  },
  detail: {
    color: colors.secondary,
    fontSize: typography.caption,
    lineHeight: 19,
    textAlign: 'center',
  },
  error: { color: colors.danger, paddingHorizontal: spacing.lg, fontSize: typography.label },
  pressed: {
    opacity: 0.72,
  },
});
