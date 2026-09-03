import { describe, expect, it } from 'vitest';

import { presentSessionError } from './sessionErrorPresentation';
import { MobileSessionHttpError, MobileSessionStreamError } from './mobileSessionTransport';

const OPTIONS = {
  apiBaseUrl: 'https://api.musee.example/api',
  showTechnicalDetails: true,
};

describe('session error presentation', () => {
  it('distinguishes load, save, and stream stages', () => {
    expect(presentSessionError(new Error('unknown'), 'load', OPTIONS).message)
      .toContain('load this session');
    expect(presentSessionError(new Error('unknown'), 'user_save', OPTIONS).message)
      .toContain('save your message');
    expect(presentSessionError(new MobileSessionStreamError(), 'stream', OPTIONS).message)
      .toContain('interrupted');
    expect(presentSessionError(new Error('unknown'), 'upload', OPTIONS).message)
      .toContain('upload this artwork');
    expect(presentSessionError(new Error('unknown'), 'analysis', OPTIONS).message)
      .toContain('analysis failed');
    expect(presentSessionError(new Error('unknown'), 'session_save', OPTIONS).message)
      .toContain('add it to this Session');
  });

  it('maps network and server failures without exposing backend text', () => {
    expect(presentSessionError(new TypeError('Network request failed'), 'stream', OPTIONS).message)
      .toContain('could not reach');
    expect(presentSessionError(new MobileSessionHttpError(503), 'user_save', OPTIONS).message)
      .toContain('temporarily unavailable');
  });
});
