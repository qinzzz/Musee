export type AuthCredentialStore = {
  clearRefreshToken: () => Promise<void>;
  getRefreshToken: () => Promise<string | null>;
  replaceRefreshToken: (token: string) => Promise<void>;
};
