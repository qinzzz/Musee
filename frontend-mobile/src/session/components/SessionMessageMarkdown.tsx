import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '../../ui/tokens/theme';
import { tokenizeSessionMessageText } from '../sessionMessageText';

type SessionMessageMarkdownProps = {
  children: string;
  streaming?: boolean;
};

export function SessionMessageMarkdown({
  children,
}: SessionMessageMarkdownProps) {
  const paragraphs = children.trim().split(/\n{2,}/);
  return (
    <View>
      {paragraphs.map((paragraph, paragraphIndex) => (
        <Text
          key={`${paragraphIndex}-${paragraph.slice(0, 24)}`}
          selectable
          style={[
            styles.paragraph,
            paragraphIndex < paragraphs.length - 1 && styles.paragraphSpacing,
          ]}
        >
          {tokenizeSessionMessageText(paragraph).map((segment, segmentIndex) => (
            <Text
              key={`${segmentIndex}-${segment.text.slice(0, 16)}`}
              style={segment.kind === 'strong'
                ? styles.strong
                : segment.kind === 'emphasis'
                  ? styles.emphasis
                  : undefined}
            >
              {segment.text}
            </Text>
          ))}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  paragraph: {
    color: colors.foreground,
    fontSize: typography.body,
    lineHeight: 27,
  },
  paragraphSpacing: {
    marginBottom: spacing.md,
  },
  strong: {
    fontWeight: '700',
  },
  emphasis: {
    fontStyle: 'italic',
  },
});
