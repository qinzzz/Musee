import { describe, expect, it, vi, afterEach } from 'vitest';
import { parseAnalysis } from './analysisText';

describe('parseAnalysis', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns plain analysis text unchanged', () => {
    expect(parseAnalysis('A luminous landscape.')).toBe('A luminous landscape.');
  });

  it('strips boilerplate date, medium, and analysis labels', () => {
    expect(
      parseAnalysis('Date: 1906\nMedium: Oil on canvas\nAnalysis: A luminous landscape.'),
    ).toBe('A luminous landscape.');
  });

  it('extracts analysis from JSON payloads', () => {
    expect(parseAnalysis('{"analysis":"Parsed from JSON."}')).toBe('Parsed from JSON.');
    expect(parseAnalysis('[{"analysis":"Array payload."}]')).toBe('Array payload.');
  });

  it('falls back safely when JSON-like text is invalid', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(parseAnalysis('{not-json}')).toBe('{not-json}');
    expect(warnSpy).toHaveBeenCalled();
  });
});
