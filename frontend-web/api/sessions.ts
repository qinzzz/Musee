import { API_BASE_URL, fetchWithTimeout } from './core';

export interface SessionMessagePayload {
  id?: string;
  role: 'user' | 'model';
  type?: 'text' | 'artwork_capture' | 'artwork_card';
  content?: string;
  artwork_id?: string;
  created_at?: number;
}

export async function fetchSessionMessages(sessionId: string): Promise<SessionMessagePayload[]> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/sessions/${sessionId}/messages`, { timeout: 10000 });
  if (!response.ok) return [];
  return response.json();
}

export async function setSessionGoal(sessionId: string, goal: string): Promise<void> {
  if (!sessionId) return;
  await fetchWithTimeout(`${API_BASE_URL}/sessions/${sessionId}/goal`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ goal }),
    timeout: 5000,
  }).catch(() => {});
}

export async function appendSessionMessages(sessionId: string, messages: SessionMessagePayload[]): Promise<void> {
  if (!messages.length) return;
  await fetchWithTimeout(`${API_BASE_URL}/sessions/${sessionId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(messages),
    timeout: 10000,
  }).catch(() => {});
}

export async function deleteSession(sessionId: string, userId: string): Promise<any> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/sessions/${sessionId}?user_id=${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error (${response.status}): ${errorText}`);
  }
  return response.json();
}

export async function updateSession(sessionId: string, userId: string, title: string): Promise<any> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/sessions/${sessionId}?user_id=${encodeURIComponent(userId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error (${response.status}): ${errorText}`);
  }
  return response.json();
}

export async function createSession(userId: string, sessionId?: string, title?: string): Promise<any> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/sessions?user_id=${encodeURIComponent(userId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      title,
    }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error (${response.status}): ${errorText}`);
  }
  return response.json();
}
