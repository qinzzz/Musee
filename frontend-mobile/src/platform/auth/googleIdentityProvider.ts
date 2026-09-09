import { Platform, TurboModuleRegistry } from 'react-native';
import { GoogleSignInError, type GoogleIdentityProvider } from '../../auth/googleSignIn';

const MODULE_NAME = 'RNGoogleSignin';
const CLIENT_ID_SUFFIX = '.apps.googleusercontent.com';
const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();

export const googleSignInAvailable = Platform.OS === 'ios'
  && Boolean(webClientId?.endsWith(CLIENT_ID_SUFFIX) && iosClientId?.endsWith(CLIENT_ID_SUFFIX))
  && Boolean(TurboModuleRegistry.get(MODULE_NAME));

// Load only on demand so email login still works in an older development binary.
async function loadSdk() {
  if (!webClientId || !iosClientId) throw new GoogleSignInError('not_configured');
  if (!googleSignInAvailable) throw new GoogleSignInError('unavailable');
  return import('@react-native-google-signin/google-signin');
}

let configured = false;
export const googleIdentityProvider: GoogleIdentityProvider = {
  async signIn() {
    const { GoogleSignin } = await loadSdk();
    try {
      if (!configured) {
        GoogleSignin.configure({ webClientId, iosClientId, offlineAccess: false });
        configured = true;
      }
      // Musee's refresh token owns restoration; always allow account selection here.
      await GoogleSignin.signOut();
      const result = await GoogleSignin.signIn();
      if (result.type === 'cancelled') return null;
      if (!result.data.idToken) throw new GoogleSignInError('missing_token');
      return result.data.idToken;
    } catch (error) {
      if (error instanceof GoogleSignInError) throw error;
      throw new GoogleSignInError('failed');
    }
  },
  async signOut() {
    if (!googleSignInAvailable) return;
    const { GoogleSignin } = await loadSdk();
    await GoogleSignin.signOut();
  },
};
