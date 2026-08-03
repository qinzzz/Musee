import { describe, expect, it } from 'vitest';
import {
  getSessionComposerHeight,
  shouldSubmitSessionComposerOnEnter,
} from './sessionComposerBehavior';

describe('session composer behavior', () => {
  it('expands a focused mobile composer to three lines', () => {
    expect(getSessionComposerHeight({
      contentHeight: 48,
      lineHeight: 24,
      chromeHeight: 32,
      isFocused: true,
      isMobile: true,
    })).toEqual({ height: 104, isScrollable: false });
  });

  it('keeps an unfocused mobile composer to exactly one line', () => {
    expect(getSessionComposerHeight({
      contentHeight: 96,
      lineHeight: 24,
      chromeHeight: 32,
      isFocused: false,
      isMobile: true,
    })).toEqual({ height: 56, isScrollable: false });
  });

  it('keeps an unfocused desktop composer to exactly one line', () => {
    expect(getSessionComposerHeight({
      contentHeight: 96,
      lineHeight: 24,
      chromeHeight: 32,
      isFocused: false,
      isMobile: false,
    })).toEqual({ height: 56, isScrollable: false });
  });

  it('caps the composer at five lines and enables internal scrolling', () => {
    expect(getSessionComposerHeight({
      contentHeight: 240,
      lineHeight: 24,
      chromeHeight: 32,
      isFocused: true,
      isMobile: true,
    })).toEqual({ height: 152, isScrollable: true });
  });

  it('keeps Enter for new lines on mobile and submits on desktop', () => {
    expect(shouldSubmitSessionComposerOnEnter({ key: 'Enter', shiftKey: false, isMobile: true })).toBe(false);
    expect(shouldSubmitSessionComposerOnEnter({ key: 'Enter', shiftKey: false, isMobile: false })).toBe(true);
    expect(shouldSubmitSessionComposerOnEnter({ key: 'Enter', shiftKey: true, isMobile: false })).toBe(false);
  });
});
