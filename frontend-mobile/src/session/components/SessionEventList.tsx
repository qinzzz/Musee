import { StyleSheet, Text, View } from 'react-native';

import type { SessionEventRecord } from '@musee/client-core';

import { MuseeButton } from '../../ui/components/MuseeButton';
import { colors, radii, spacing, typography } from '../../ui/tokens/theme';
import { SessionMessageMarkdown } from './SessionMessageMarkdown';

type SessionEventListProps = {
  events: SessionEventRecord[];
  onRetryResponse: (responseEventId: string) => void;
};

function responseStatus(event: SessionEventRecord): string | null {
  return typeof event.payload?.status === 'string' ? event.payload.status : null;
}

function responseError(event: SessionEventRecord): string {
  return typeof event.payload?.error_message === 'string'
    ? event.payload.error_message
    : 'This response was interrupted. Please try again.';
}

export function SessionEventList({ events, onRetryResponse }: SessionEventListProps) {
  return (
    <View style={styles.list}>
      {events.map((event) => {
        if (event.event_type === 'user_input' && event.content) {
          return (
            <View key={event.id} style={styles.userRow}>
              <View style={styles.userBubble}>
                <Text style={styles.userText}>{event.content}</Text>
              </View>
            </View>
          );
        }

        if (event.event_type !== 'model_response') return null;
        const status = responseStatus(event);
        if (status === 'pending' && !event.content) return null;
        if (status === 'failed') {
          return (
            <View key={event.id} style={styles.failedCard}>
              <Text style={styles.failedText}>{responseError(event)}</Text>
              <MuseeButton
                label="Try response again"
                onPress={() => onRetryResponse(event.id)}
                variant="secondary"
              />
            </View>
          );
        }
        if (!event.content) return null;
        return (
          <View key={event.id} style={styles.modelRow}>
            <SessionMessageMarkdown streaming={status === 'pending'}>
              {event.content}
            </SessionMessageMarkdown>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.lg,
  },
  userRow: {
    alignItems: 'flex-end',
  },
  userBubble: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: '88%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  userText: {
    color: colors.foreground,
    fontSize: typography.body,
    lineHeight: 24,
  },
  modelRow: {
    paddingHorizontal: spacing.xs,
  },
  failedCard: {
    borderColor: colors.danger,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
    padding: spacing.md,
  },
  failedText: {
    color: colors.danger,
    fontSize: typography.label,
    lineHeight: 20,
  },
});
