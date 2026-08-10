import { describe, expect, it } from 'vitest';
import { buildInitialSessionTitle, MAX_INITIAL_SESSION_TITLE_LENGTH } from './sessionCreation';

describe('session creation', () => {
  it('uses the normalized first message as the initial session title', () => {
    expect(buildInitialSessionTitle('  What   draws me to this piece?  ', 'Untitled Session'))
      .toBe('What draws me to this piece?');
  });

  it('falls back for artwork-only input and bounds long sidebar titles', () => {
    expect(buildInitialSessionTitle('', 'Untitled Session')).toBe('Untitled Session');
    expect(buildInitialSessionTitle('a'.repeat(100), 'Untitled Session'))
      .toHaveLength(MAX_INITIAL_SESSION_TITLE_LENGTH);
  });
});
