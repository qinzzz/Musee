import { Fragment, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { SessionEventRecord } from '@musee/client-core';

import type { MobileArtworkRecord } from '../../library/types';
import { MuseeButton } from '../../ui/components/MuseeButton';
import { colors, radii, spacing, typography } from '../../ui/tokens/theme';
import { buildSessionArtworkPresentation } from '../sessionArtworkPresentation';
import {
  getSessionEventTextPresentation,
  type SessionEventTextPresentation,
} from '../sessionEventState';
import { SessionArtworkCards } from './SessionArtworkCards';
import { MarkdownText } from '../../ui/components/MarkdownText';

type SessionEventListProps = {
  artworks: MobileArtworkRecord[];
  events: SessionEventRecord[];
  onOpenArtwork: (artworkId: string) => void;
  onRetryResponse: (responseEventId: string) => void;
};

function SessionEventText({
  eventId,
  onRetryResponse,
  presentation,
}: {
  eventId: string;
  onRetryResponse: (responseEventId: string) => void;
  presentation: SessionEventTextPresentation;
}) {
  if (presentation.kind === 'user') {
    return (
      <View style={styles.userRow}>
        <View style={styles.userBubble}>
          <Text style={styles.userText}>{presentation.text}</Text>
        </View>
      </View>
    );
  }
  if (presentation.kind === 'model') {
    return (
      <View style={styles.modelRow}>
        <MarkdownText streaming={presentation.streaming}>
          {presentation.text}
        </MarkdownText>
      </View>
    );
  }
  if (presentation.kind === 'status') {
    return (
      <View style={styles.statusCard}>
        <Text style={styles.statusText}>{presentation.text}</Text>
      </View>
    );
  }
  return (
    <View style={styles.failedCard}>
      <Text accessibilityLiveRegion="polite" style={styles.failedText}>
        {presentation.text}
      </Text>
      {presentation.retryable ? (
        <MuseeButton
          label="Try response again"
          onPress={() => onRetryResponse(eventId)}
          variant="secondary"
        />
      ) : null}
    </View>
  );
}

export function SessionEventList({
  artworks,
  events,
  onOpenArtwork,
  onRetryResponse,
}: SessionEventListProps) {
  const artworkPresentation = useMemo(
    () => buildSessionArtworkPresentation(events, artworks),
    [artworks, events],
  );
  return (
    <View style={styles.list}>
      {artworkPresentation.orphanGroup ? (
        <SessionArtworkCards
          group={artworkPresentation.orphanGroup}
          onOpenArtwork={onOpenArtwork}
        />
      ) : null}
      {events.map((event) => {
        const artworkGroup = artworkPresentation.eventGroups[event.id];
        const textPresentation = getSessionEventTextPresentation(event);
        if (!artworkGroup && !textPresentation) return null;
        return (
          <Fragment key={event.id}>
            {artworkGroup ? (
              <SessionArtworkCards group={artworkGroup} onOpenArtwork={onOpenArtwork} />
            ) : null}
            {textPresentation ? (
              <SessionEventText
                eventId={event.id}
                onRetryResponse={onRetryResponse}
                presentation={textPresentation}
              />
            ) : null}
          </Fragment>
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
  statusCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
  },
  statusText: {
    color: colors.secondary,
    fontSize: typography.label,
    lineHeight: 20,
  },
});
