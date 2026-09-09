export type GoogleSignInErrorCode = 'not_configured' | 'unavailable' | 'missing_token' | 'failed';

const MESSAGES: Record<GoogleSignInErrorCode, string> = {
  not_configured: 'Google sign-in is not configured in this build.',
  unavailable: 'Google sign-in requires an updated Musee build.',
  missing_token: 'Google could not complete sign-in. Please try again.',
  failed: 'Google sign-in could not finish. Please try again.',
};

export class GoogleSignInError extends Error {
  constructor(readonly code: GoogleSignInErrorCode) {
    super(MESSAGES[code]);
    this.name = 'GoogleSignInError';
  }
}

export type GoogleIdentityProvider = {
  signIn: () => Promise<string | null>;
  signOut: () => Promise<void>;
};
