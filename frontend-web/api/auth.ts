import { API_BASE_URL, AUTH_TOKEN_KEY, USER_INFO_KEY, getOrCreateUserId } from './core';

export async function loginWithGoogle(idToken: string, anonymousUserId?: string): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/auth/google`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id_token: idToken,
      anonymous_user_id: anonymousUserId,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Login failed: ${errorText}`);
  }

  const data = await response.json();

  if (data.access_token) {
    localStorage.setItem(AUTH_TOKEN_KEY, data.access_token);
  }
  if (data.user) {
    localStorage.setItem(USER_INFO_KEY, JSON.stringify(data.user));
    localStorage.setItem('musee_user_id', data.user.user_id);
  }

  return data;
}

export function logout() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(USER_INFO_KEY);
  localStorage.removeItem('musee_user_id');
}

export function getCurrentUser(): any | null {
  const userInfo = localStorage.getItem(USER_INFO_KEY);
  return userInfo ? JSON.parse(userInfo) : null;
}

export { getOrCreateUserId };

