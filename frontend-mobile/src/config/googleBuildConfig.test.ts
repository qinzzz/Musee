import { createRequire } from 'node:module';
import { afterEach, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const configure = require('../../app.config.js') as (input: {
  config: { plugins: string[]; name: string };
}) => { plugins: (string | [string, { iosUrlScheme: string }])[]; name: string };
const config = { plugins: ['expo-router'], name: 'Musee' };
afterEach(() => vi.unstubAllEnvs());

it('keeps email-only builds valid when Google configuration is absent', () => {
  vi.stubEnv('EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID', '');
  vi.stubEnv('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID', '');
  expect(configure({ config })).toEqual(config);
});

it('derives the native callback from the iOS client, not the web client', () => {
  vi.stubEnv('EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID', '123-ios.apps.googleusercontent.com');
  vi.stubEnv('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID', '123-web.apps.googleusercontent.com');
  expect(configure({ config }).plugins).toEqual(['expo-router', [
    '@react-native-google-signin/google-signin', { iosUrlScheme: 'com.googleusercontent.apps.123-ios' },
  ]]);
});

it('rejects incomplete configuration before building an unusable sign-in flow', () => {
  vi.stubEnv('EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID', '');
  vi.stubEnv('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID', '123-web.apps.googleusercontent.com');
  expect(() => configure({ config })).toThrow('Set both');
});
