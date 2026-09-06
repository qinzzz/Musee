import { describe, expect, it } from 'vitest';

import { tokenizeSessionMessageText } from '../sessionMessageText';

describe('session message text', () => {
  it('preserves plain response text and formats inline emphasis', () => {
    expect(tokenizeSessionMessageText(
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
