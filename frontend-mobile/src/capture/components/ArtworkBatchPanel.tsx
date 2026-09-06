import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { MobileArtworkBatchEntry } from '../mobileArtworkBatchService';
import { MuseeButton } from '../../ui/components/MuseeButton';
import { colors, radii, spacing, typography } from '../../ui/tokens/theme';

type ArtworkBatchPanelProps = {
  entries: MobileArtworkBatchEntry[];
  getErrorMessage: (entry: MobileArtworkBatchEntry) => string;
  running: boolean;
  onOpenLibrary: () => void;
  onRemove: (entryId: string) => void;
  onReset: () => void;
  onRetry: (entryId: string) => void;
  onStart: () => void;
};

const COPY = {
  analyzing: 'Analyzing…',
  complete: 'Complete',
  heading: 'Selected artworks',
  openLibrary: 'Open Library',
  queued: 'Ready',
  remove: 'Remove',
  reset: 'Choose another batch',
  retry: 'Try again',
  uploaded: 'Waiting for analysis',
  uploading: 'Uploading…',
} as const;

function isFailed(entry: MobileArtworkBatchEntry): boolean {
  return entry.status === 'upload_failed' || entry.status === 'analysis_failed';
}

function statusLabel(entry: MobileArtworkBatchEntry): string {
  if (entry.status === 'uploading') return COPY.uploading;
  if (entry.status === 'uploaded') return COPY.uploaded;
  if (entry.status === 'analyzing') return COPY.analyzing;
  if (entry.status === 'complete') return COPY.complete;
  if (isFailed(entry)) return 'Needs attention';
  return COPY.queued;
}

export function ArtworkBatchPanel({
  entries,
  getErrorMessage,
  running,
  onOpenLibrary,
  onRemove,
  onReset,
  onRetry,
  onStart,
}: ArtworkBatchPanelProps) {
  const started = entries.some((entry) => entry.status !== 'queued');
  const completedCount = entries.filter((entry) => entry.status === 'complete').length;
  const failedCount = entries.filter(isFailed).length;
  const finished = started && !running;

  return (
    <View style={styles.panel}>
      <View style={styles.summary}>
        <Text style={styles.heading}>{COPY.heading}</Text>
        <Text accessibilityLiveRegion="polite" style={styles.summaryText}>
          {running
            ? `${completedCount} of ${entries.length} complete`
            : finished
              ? `${completedCount} complete${failedCount ? ` · ${failedCount} need attention` : ''}`
              : `${entries.length} selected`}
        </Text>
      </View>

      <View style={styles.list}>
        {entries.map((entry) => (
          <View key={entry.id} style={styles.item}>
            <Image
              accessibilityLabel={entry.input.fileName}
              contentFit="cover"
              source={{ uri: entry.input.uri }}
              style={styles.thumbnail}
            />
            <View style={styles.itemCopy}>
              <Text numberOfLines={1} style={styles.itemTitle}>
                {entry.result?.artworkName || entry.input.fileName}
              </Text>
              <Text style={[
                styles.status,
                entry.status === 'complete' && styles.success,
                isFailed(entry) && styles.failure,
              ]}>
                {statusLabel(entry)}
              </Text>
              {entry.result?.artistName ? (
                <Text numberOfLines={1} style={styles.detail}>{entry.result.artistName}</Text>
              ) : null}
              {isFailed(entry) ? (
                <Text style={styles.error}>{getErrorMessage(entry)}</Text>
              ) : null}
            </View>
            {!started ? (
              <Pressable
                accessibilityLabel={`Remove ${entry.input.fileName}`}
                accessibilityRole="button"
                onPress={() => onRemove(entry.id)}
                style={({ pressed }) => [styles.smallAction, pressed && styles.pressed]}
              >
                <Text style={styles.removeLabel}>{COPY.remove}</Text>
              </Pressable>
            ) : isFailed(entry) ? (
              <Pressable
                accessibilityLabel={`Retry ${entry.input.fileName}`}
                accessibilityRole="button"
                disabled={running}
                onPress={() => onRetry(entry.id)}
                style={({ pressed }) => [
                  styles.smallAction,
                  pressed && styles.pressed,
                  running && styles.disabled,
                ]}
              >
                <Text style={styles.retryLabel}>{COPY.retry}</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
      </View>

      {!started ? (
        <MuseeButton
          disabled={entries.length === 0}
          label={`Upload ${entries.length} artwork${entries.length === 1 ? '' : 's'}`}
          onPress={onStart}
        />
      ) : null}
      {finished ? (
        <View style={styles.actions}>
          <MuseeButton label={COPY.openLibrary} onPress={onOpenLibrary} />
          <MuseeButton label={COPY.reset} onPress={onReset} variant="secondary" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: spacing.md,
  },
  summary: {
    gap: spacing.xs,
  },
  heading: {
    color: colors.foreground,
    fontSize: typography.body,
    fontWeight: '600',
  },
  summaryText: {
    color: colors.secondary,
    fontSize: typography.label,
  },
  list: {
    gap: spacing.sm,
  },
  item: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  thumbnail: {
    backgroundColor: colors.background,
    borderRadius: radii.button,
    height: 72,
    width: 72,
  },
  itemCopy: {
    flex: 1,
    gap: 2,
  },
  itemTitle: {
    color: colors.foreground,
    fontSize: typography.label,
    fontWeight: '600',
  },
  status: {
    color: colors.secondary,
    fontSize: typography.caption,
  },
  success: {
    color: colors.success,
  },
  failure: {
    color: colors.danger,
  },
  detail: {
    color: colors.secondary,
    fontSize: typography.caption,
  },
  error: {
    color: colors.danger,
    fontSize: typography.caption,
    lineHeight: 17,
  },
  smallAction: {
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.xs,
  },
  removeLabel: {
    color: colors.danger,
    fontSize: typography.caption,
    fontWeight: '600',
  },
  retryLabel: {
    color: colors.foreground,
    fontSize: typography.caption,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.45,
  },
  actions: {
    gap: spacing.sm,
  },
});
