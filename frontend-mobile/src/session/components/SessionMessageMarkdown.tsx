import {
  EnrichedMarkdownText,
  type MarkdownStyle,
} from 'react-native-enriched-markdown';
import { Linking } from 'react-native';

import { colors, radii, spacing, typography } from '../../ui/tokens/theme';

type SessionMessageMarkdownProps = {
  children: string;
  streaming?: boolean;
};

const ALLOWED_LINK_PROTOCOLS = new Set(['http:', 'https:']);

const markdownStyle: MarkdownStyle = {
  paragraph: {
    color: colors.foreground,
    fontSize: typography.body,
    lineHeight: 27,
    marginBottom: spacing.md,
  },
  h1: {
    color: colors.foreground,
    fontSize: typography.heading,
    fontWeight: '600',
    lineHeight: 32,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  h2: {
    color: colors.foreground,
    fontSize: 21,
    fontWeight: '600',
    lineHeight: 28,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  h3: {
    color: colors.foreground,
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 25,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  list: {
    bulletColor: colors.secondary,
    color: colors.foreground,
    fontSize: typography.body,
    gapWidth: spacing.sm,
    itemSpacing: spacing.xs,
    lineHeight: 27,
    marginBottom: spacing.md,
    marginLeft: spacing.lg,
  },
  blockquote: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.button,
    borderWidth: 2,
    color: colors.secondary,
    fontSize: typography.body,
    gapWidth: spacing.md,
    lineHeight: 26,
    marginBottom: spacing.md,
    padding: spacing.sm,
  },
  strong: {
    color: colors.foreground,
    fontWeight: 'bold',
  },
  em: {
    color: colors.foreground,
    fontStyle: 'italic',
  },
  link: {
    color: colors.foreground,
    underline: true,
  },
  code: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    color: colors.foreground,
    fontSize: 15,
  },
  codeBlock: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.button,
    borderWidth: 1,
    color: colors.foreground,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  thematicBreak: {
    color: colors.border,
    marginBottom: spacing.md,
    marginTop: spacing.md,
  },
};

async function openExternalLink(url: string): Promise<void> {
  try {
    const parsedUrl = new URL(url);
    if (!ALLOWED_LINK_PROTOCOLS.has(parsedUrl.protocol)) return;
    await Linking.openURL(parsedUrl.toString());
  } catch {
    // Ignore malformed or unsupported links returned in model-authored Markdown.
  }
}

export function SessionMessageMarkdown({
  children,
  streaming = false,
}: SessionMessageMarkdownProps) {
  return (
    <EnrichedMarkdownText
      enableTaskListItemToggle={false}
      flavor="github"
      markdown={children}
      markdownStyle={markdownStyle}
      md4cFlags={{ latexMath: false }}
      onLinkPress={({ url }) => void openExternalLink(url)}
      selectable
      streamingAnimation={streaming}
    />
  );
}
