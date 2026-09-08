export type MarkdownTextSegment = {
  kind: 'emphasis' | 'plain' | 'strong';
  text: string;
};

const INLINE_MARKDOWN_PATTERN = /(\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_)/g;

export function tokenizeMarkdownText(value: string): MarkdownTextSegment[] {
  const segments: MarkdownTextSegment[] = [];
  let cursor = 0;
  for (const match of value.matchAll(INLINE_MARKDOWN_PATTERN)) {
    const index = match.index ?? cursor;
    if (index > cursor) segments.push({ kind: 'plain', text: value.slice(cursor, index) });
    const token = match[0];
    const strong = token.startsWith('**') || token.startsWith('__');
    segments.push({
      kind: strong ? 'strong' : 'emphasis',
      text: token.slice(strong ? 2 : 1, strong ? -2 : -1),
    });
    cursor = index + token.length;
  }
  if (cursor < value.length) segments.push({ kind: 'plain', text: value.slice(cursor) });
  return segments;
}
