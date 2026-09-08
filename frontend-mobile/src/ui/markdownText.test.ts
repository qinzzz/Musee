import { describe, expect, it } from 'vitest';

import { tokenizeMarkdownText } from './markdownText';

describe('shared Markdown text', () => {
  it('preserves plain response text and formats inline emphasis', () => {
    expect(tokenizeMarkdownText(
      'These are **Theaster Gates** works with *playful* details.',
    )).toEqual([
      { kind: 'plain', text: 'These are ' },
      { kind: 'strong', text: 'Theaster Gates' },
      { kind: 'plain', text: ' works with ' },
      { kind: 'emphasis', text: 'playful' },
      { kind: 'plain', text: ' details.' },
    ]);
  });
});
