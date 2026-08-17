import { API_BASE_URL, fetchWithTimeout } from '../../api/core';
import type { GalleryItem } from '../../types';

export interface SessionRecord {
  id: string;
  user_id: string;
  title: string;
  user_title?: string | null;
  system_title?: string | null;
  title_state?: 'draft' | 'auto' | 'user_locked';
  narrative_summary?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface SessionEventPayload {
  id?: string;
  role: 'user' | 'model' | 'system';
  type?: 'text' | 'artwork_capture' | 'artwork_card' | 'artwork_commentary' | 'model_response';
  event_type?: 'user_input' | 'artwork_result' | 'artwork_commentary' | 'model_response' | 'message';
  content?: string;
  artwork_id?: string;
  artwork_ids?: string[];
  trigger_event_id?: string;
  turn_id?: string;
  sequence_number?: number;
  payload?: Record<string, unknown>;
  created_at?: number | string;
}

export interface StartSessionWithEventPayload {
  session_id?: string;
  title?: string;
  event: SessionEventPayload;
}

export interface StartSessionWithArtworksPayload {
  session_id?: string;
  title?: string;
  artwork_ids: string[];
}

export class SessionPolicyError extends Error {
  readonly code: string;
  readonly requiresAuthentication: boolean;

  constructor(code: string, message: string, requiresAuthentication = false) {
    super(message);
    this.name = 'SessionPolicyError';
    this.code = code;
    this.requiresAuthentication = requiresAuthentication;
  }
}

async function buildSessionApiError(response: Response, fallback: string): Promise<Error> {
  const text = await response.text();
  try {
    const body = JSON.parse(text) as {
      detail?: string | { error_code?: string; message?: string; requires_authentication?: boolean };
    };
    if (typeof body.detail === 'object' && body.detail?.error_code) {
      return new SessionPolicyError(
        body.detail.error_code,
        body.detail.message || fallback,
        Boolean(body.detail.requires_authentication),
      );
    }
  } catch {
    // Keep the server text or caller fallback below.
  }
  return new Error(text ? `${fallback}: ${text}` : fallback);
}

export async function fetchSessionEvents(sessionId: string): Promise<SessionEventPayload[]> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/sessions/${sessionId}/events`, { timeout: 10000 });
  if (!response.ok) {
    throw new Error(`API error (${response.status}): failed to fetch session events`);
  }
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

// Request dedupe lives in the shared query layer (see useSessionsQuery);
// this stays a plain fetch. A non-OK response throws so callers keep their
// last-good data instead of treating an outage as an empty session list.
export async function fetchSessions(userId: string): Promise<SessionRecord[]> {
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/sessions?user_id=${encodeURIComponent(userId)}`,
    {},
  );
  if (!response.ok) {
    throw new Error(`API error (${response.status}): failed to fetch sessions`);
  }
  return response.json();
}

export async function appendSessionEvents(sessionId: string, events: SessionEventPayload[]): Promise<void> {
  if (!events.length) return;
  const response = await fetchWithTimeout(`${API_BASE_URL}/sessions/${sessionId}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(events),
    timeout: 10000,
  });
  if (!response.ok) {
    throw await buildSessionApiError(response, `API error (${response.status})`);
  }
}

export async function updateSessionEvent(
  sessionId: string,
  eventId: string,
  event: SessionEventPayload,
): Promise<SessionEventPayload> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/sessions/${sessionId}/events/${eventId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
    timeout: 10000,
  });
  if (!response.ok) {
    throw await buildSessionApiError(response, `API error (${response.status}): failed to update session event`);
  }
  return response.json();
}

export async function startSessionWithEvent(userId: string, payload: StartSessionWithEventPayload): Promise<any> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/sessions/start-with-event?user_id=${encodeURIComponent(userId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    timeout: 10000,
  });
  if (!response.ok) {
    throw await buildSessionApiError(response, `API error (${response.status}): failed to start session`);
  }
  return response.json();
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

export async function ensureSession(userId: string, sessionId: string, title: string): Promise<SessionRecord> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/sessions?user_id=${encodeURIComponent(userId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      title,
    }),
  });
  if (!response.ok) {
    throw await buildSessionApiError(response, `API error (${response.status}): failed to start session`);
  }
  const payload = await response.json();
  return payload.session as SessionRecord;
}

export async function startSessionWithArtworks(userId: string, payload: StartSessionWithArtworksPayload): Promise<any> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/sessions/start-with-artworks?user_id=${encodeURIComponent(userId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw await buildSessionApiError(response, `API error (${response.status}): failed to start session`);
  }
  return response.json();
}

export async function attachArtworksToSession(
  sessionId: string,
  userId: string,
  artworkIds: string[],
): Promise<{ inserted: number; artworks: any[] }> {
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/sessions/${sessionId}/artworks?user_id=${encodeURIComponent(userId)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artwork_ids: artworkIds }),
    },
  );
  if (!response.ok) {
    throw await buildSessionApiError(response, `API error (${response.status}): failed to attach artworks`);
  }
  return response.json();
}

export async function fetchSessionArtworks(
  sessionId: string,
  userId: string,
): Promise<GalleryItem[]> {
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/sessions/${sessionId}/artworks?user_id=${encodeURIComponent(userId)}`,
  );
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error (${response.status}): ${errorText}`);
  }
  return response.json();
}
