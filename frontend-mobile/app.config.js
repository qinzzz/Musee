// OAuth IDs are public configuration. No client secret belongs in the app.
module.exports = ({ config }) => {
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
  const clientIdPattern = /^[a-zA-Z0-9-]+\.apps\.googleusercontent\.com$/;
  if (!iosClientId && !webClientId) return config;
  if (!clientIdPattern.test(iosClientId || '') || !clientIdPattern.test(webClientId || '')) {
    throw new Error('Set both EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID and EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID to valid Google OAuth client IDs.');
  }
  return {
    ...config,
    plugins: [
      ...(config.plugins || []),
      ['@react-native-google-signin/google-signin', {
        iosUrlScheme: iosClientId.split('.').reverse().join('.'),
      }],
    ],
  };
};
