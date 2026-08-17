import {
  API_BASE_URL,
  AUTH_TOKEN_KEY,
  USER_ID_KEY,
  USER_INFO_KEY,
  fetchWithTimeout,
  getOrCreateUserId,
  refreshAccessToken,
  setAccessToken,
} from './core';

const POST_AUTH_WELCOME_KEY = 'musee_post_auth_welcome';
export type PostAuthWelcome = 'new' | 'returning';

export function rememberPostAuthWelcome(isNewUser: boolean): void {
  sessionStorage.setItem(POST_AUTH_WELCOME_KEY, isNewUser ? 'new' : 'returning');
}

export function consumePostAuthWelcome(): PostAuthWelcome | null {
  const value = sessionStorage.getItem(POST_AUTH_WELCOME_KEY);
  sessionStorage.removeItem(POST_AUTH_WELCOME_KEY);
  return value === 'new' || value === 'returning' ? value : null;
}

// Persist a login response (google and email flows share the same shape).
function storeSession(data: any) {
  if (data.access_token) {
    setAccessToken(data.access_token);
  }
  if (data.user) {
    localStorage.setItem(USER_ID_KEY, data.user.user_id);
  }
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(USER_INFO_KEY);
}

// Carries the backend's structured error body so the UI can branch on code.
export class EmailAuthError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

async function postAuth(path: string, body: Record<string, unknown>): Promise<any> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    let code = 'auth_failed';
    let message = 'Something went wrong. Please try again.';
    try {
      const detail = (await response.json())?.detail;
      if (detail?.error_code) code = detail.error_code;
      if (detail?.message) message = detail.message;
    } catch {
      // Non-JSON error body; keep the generic message.
    }
    throw new EmailAuthError(code, message);
  }
  return response.json();
}

export async function signupWithEmail(email: string, password: string): Promise<any> {
  return postAuth('/auth/signup', {
    email,
    password,
  });
}

export async function loginWithEmail(email: string, password: string): Promise<any> {
  const data = await postAuth('/auth/login', {
    email,
    password,
  });
  storeSession(data);
  return data;
}

export async function verifyEmailToken(token: string): Promise<any> {
  const data = await postAuth('/auth/verify-email', { token });
  storeSession(data);
  return data;
}

export async function requestPasswordReset(email: string): Promise<void> {
  await postAuth('/auth/request-password-reset', { email });
}

export async function resetPassword(token: string, newPassword: string): Promise<any> {
  const data = await postAuth('/auth/reset-password', {
    token,
    new_password: newPassword,
  });
  storeSession(data);
  return data;
}

export async function loginWithGoogle(idToken: string): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/auth/google`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({
      id_token: idToken,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Login failed: ${errorText}`);
  }

  const data = await response.json();
  storeSession(data);
  return data;
}

export async function logout(): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/auth/logout`, { method: 'POST', credentials: 'include' });
  } catch {
    // Local sign-out must still complete when the server is unreachable.
  } finally {
    setAccessToken(null);
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(USER_INFO_KEY);
    localStorage.removeItem(USER_ID_KEY);
  }
}

export type AuthSessionSnapshot = {
  state: 'guest' | 'authenticated';
  principal: { kind: 'guest' | 'authenticated'; user_id: string; [key: string]: unknown } | null;
  capabilities: Record<string, boolean>;
  quotas: Record<string, unknown>;
  plan: string | null;
};

export async function bootstrapAuthSession(): Promise<AuthSessionSnapshot> {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(USER_INFO_KEY);
  const token = await refreshAccessToken();
  const guestUserId = !token ? localStorage.getItem(USER_ID_KEY) : null;
  const query = guestUserId ? `?guest_user_id=${encodeURIComponent(guestUserId)}` : '';
  const response = await fetchWithTimeout(`${API_BASE_URL}/auth/session${query}`);
  if (!response.ok) {
    setAccessToken(null);
    return { state: 'guest', principal: null, capabilities: {}, quotas: {}, plan: null };
  }
  const snapshot = await response.json() as AuthSessionSnapshot;
  if (snapshot.principal?.user_id) {
    localStorage.setItem(USER_ID_KEY, snapshot.principal.user_id);
  }
  return snapshot;
}

export { getOrCreateUserId };
