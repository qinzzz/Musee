import {
  createSseParser,
  parseSessionChatStreamEvent,
  type ApiClient,
  type ArtworkRecord,
  type SessionChatHistoryEntry,
  type SessionChatPhase,
  type SessionEventRecord,
  type SessionRecord,
} from '@musee/client-core';

export type SessionEventWrite = Pick<SessionEventRecord, 'event_type' | 'role'> &
  Partial<Pick<
    SessionEventRecord,
    'artwork_ids' | 'content' | 'id' | 'payload' | 'trigger_event_id'
  >>;

export type StartTextSessionInput = {
  event: SessionEventWrite;
  sessionId: string;
  title: string;
  userId: string;
};

export type StartArtworkSessionInput = {
  artworkId: string;
  sessionId: string;
  title: string;
  userId: string;
};

export type SessionChatArtworkInput = {
  artworkName: string;
  artistName: string;
  date: string | null;
  description: string | null;
  id: string;
  keywords: string[];
  medium: string | null;
  url: string;
};

export type StreamTextSessionInput = {
  history: SessionChatHistoryEntry[];
  items: SessionChatArtworkInput[];
  message: string;
  sessionId: string;
  triggerEventId: string;
  userId: string;
};

export type StreamTextSessionCallbacks = {
  onChunk?: (chunk: string) => void;
  onPhase?: (phase: SessionChatPhase) => void;
};

export type StreamTextSessionResult = {
  response: string;
  retrieval?: Record<string, unknown>;
};

export type MobileSessionTransport = {
  appendEvents: (sessionId: string, events: SessionEventWrite[]) => Promise<void>;
  fetchArtworks: (sessionId: string, userId: string) => Promise<ArtworkRecord[]>;
  fetchEvents: (sessionId: string) => Promise<SessionEventRecord[]>;
  fetchSessions: (userId: string) => Promise<SessionRecord[]>;
  startArtworkSession: (input: StartArtworkSessionInput) => Promise<SessionRecord>;
  startTextSession: (input: StartTextSessionInput) => Promise<SessionRecord>;
  streamTextResponse: (
    input: StreamTextSessionInput,
    callbacks?: StreamTextSessionCallbacks,
  ) => Promise<StreamTextSessionResult>;
  updateEvent: (
    sessionId: string,
    eventId: string,
    event: SessionEventWrite,
  ) => Promise<SessionEventRecord>;
};

export type MobileSessionTransportOptions = {
  apiBaseUrl: string;
  apiClient: ApiClient;
};

const CONTENT_TYPE_HEADER = 'Content-Type';
const JSON_CONTENT_TYPE = 'application/json';
const SESSION_REQUEST_TIMEOUT_MS = 10_000;
const SESSION_STREAM_CONNECT_TIMEOUT_MS = 30_000;
const SESSION_STREAM_IDLE_TIMEOUT_MS = 60_000;
const SESSION_REQUEST_FAILED_MESSAGE = 'Musee session request failed.';
const SESSION_STREAM_FAILED_MESSAGE = 'Musee could not complete this response.';

export class MobileSessionHttpError extends Error {
  readonly code: string | null;
  readonly requiresAuthentication: boolean;
  readonly status: number;

  constructor(
    status: number,
    code: string | null = null,
    requiresAuthentication = false,
  ) {
    super(SESSION_REQUEST_FAILED_MESSAGE);
    this.name = 'MobileSessionHttpError';
    this.status = status;
    this.code = code;
    this.requiresAuthentication = requiresAuthentication;
  }
}

export class MobileSessionStreamError extends Error {
  constructor(message = SESSION_STREAM_FAILED_MESSAGE) {
    super(message);
    this.name = 'MobileSessionStreamError';
  }
}

async function requireSuccess(response: Response): Promise<Response> {
  if (response.ok) return response;

  let code: string | null = null;
  let requiresAuthentication = false;
  try {
    const body = await response.json() as {
      detail?: { error_code?: string; requires_authentication?: boolean } | string;
    };
    if (typeof body.detail === 'object' && body.detail) {
      code = body.detail.error_code ?? null;
      requiresAuthentication = Boolean(body.detail.requires_authentication);
    }
  } catch {
    // The status remains sufficient when the backend does not return JSON.
  }
  throw new MobileSessionHttpError(response.status, code, requiresAuthentication);
}

async function readWithIdleTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new MobileSessionStreamError('The response stream timed out.'));
        }, SESSION_STREAM_IDLE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

export function createMobileSessionTransport({
  apiBaseUrl,
  apiClient,
}: MobileSessionTransportOptions): MobileSessionTransport {
  const jsonHeaders = { [CONTENT_TYPE_HEADER]: JSON_CONTENT_TYPE };

  return {
    async fetchArtworks(sessionId, userId) {
      const response = await apiClient.fetchWithTimeout(
        `${apiBaseUrl}/sessions/${encodeURIComponent(sessionId)}/artworks?user_id=${encodeURIComponent(userId)}`,
        { timeout: SESSION_REQUEST_TIMEOUT_MS },
      );
      const body = await (await requireSuccess(response)).json() as { items: ArtworkRecord[] };
      return body.items;
    },

    async fetchSessions(userId) {
      const response = await apiClient.fetchWithTimeout(
        `${apiBaseUrl}/sessions?user_id=${encodeURIComponent(userId)}`,
        { timeout: SESSION_REQUEST_TIMEOUT_MS },
      );
      return (await requireSuccess(response)).json() as Promise<SessionRecord[]>;
    },

    async fetchEvents(sessionId) {
      const response = await apiClient.fetchWithTimeout(
        `${apiBaseUrl}/sessions/${encodeURIComponent(sessionId)}/events`,
        { timeout: SESSION_REQUEST_TIMEOUT_MS },
      );
      return (await requireSuccess(response)).json() as Promise<SessionEventRecord[]>;
    },

    async startArtworkSession({ artworkId, sessionId, title, userId }) {
      const response = await apiClient.fetchWithTimeout(
        `${apiBaseUrl}/sessions/start-with-artworks?user_id=${encodeURIComponent(userId)}`,
        {
          method: 'POST',
          headers: jsonHeaders,
          body: JSON.stringify({
            artwork_ids: [artworkId],
            session_id: sessionId,
            title,
          }),
          timeout: SESSION_REQUEST_TIMEOUT_MS,
        },
      );
      const body = await (await requireSuccess(response)).json() as { session: SessionRecord };
      return body.session;
    },

    async startTextSession({ event, sessionId, title, userId }) {
      const response = await apiClient.fetchWithTimeout(
        `${apiBaseUrl}/sessions/start-with-event?user_id=${encodeURIComponent(userId)}`,
        {
          method: 'POST',
          headers: jsonHeaders,
          body: JSON.stringify({
            session_id: sessionId,
            title,
            event,
          }),
          timeout: SESSION_REQUEST_TIMEOUT_MS,
        },
      );
      const body = await (await requireSuccess(response)).json() as { session: SessionRecord };
      return body.session;
    },

    async appendEvents(sessionId, events) {
      if (events.length === 0) return;
      const response = await apiClient.fetchWithTimeout(
        `${apiBaseUrl}/sessions/${encodeURIComponent(sessionId)}/events`,
        {
          method: 'POST',
          headers: jsonHeaders,
          body: JSON.stringify(events),
          timeout: SESSION_REQUEST_TIMEOUT_MS,
        },
      );
      await requireSuccess(response);
    },

    async updateEvent(sessionId, eventId, event) {
      const response = await apiClient.fetchWithTimeout(
        `${apiBaseUrl}/sessions/${encodeURIComponent(sessionId)}/events/${encodeURIComponent(eventId)}`,
        {
          method: 'PATCH',
          headers: jsonHeaders,
          body: JSON.stringify(event),
          timeout: SESSION_REQUEST_TIMEOUT_MS,
        },
      );
      return (await requireSuccess(response)).json() as Promise<SessionEventRecord>;
    },

    async streamTextResponse(input, callbacks = {}) {
      const response = await apiClient.fetchWithTimeout(`${apiBaseUrl}/visit/chat-stream`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({
          items: input.items.map((item) => ({
            id: item.id,
            url: item.url,
            keywords: item.keywords,
            artist_name: item.artistName,
            artwork_name: item.artworkName,
            description: item.description,
            date: item.date,
            medium: item.medium,
          })),
          conversation_history: input.history,
          new_message: input.message,
          user_id: input.userId,
          session_id: input.sessionId,
          trigger_event_id: input.triggerEventId,
        }),
        timeout: SESSION_STREAM_CONNECT_TIMEOUT_MS,
      });
      await requireSuccess(response);

      const reader = response.body?.getReader();
      if (!reader) throw new MobileSessionStreamError('The response stream is unavailable.');
      const decoder = new TextDecoder();
      const parser = createSseParser();
      let result: StreamTextSessionResult | null = null;

      const consume = (messages: ReturnType<typeof parser.push>) => {
        for (const message of messages) {
          const event = parseSessionChatStreamEvent(message);
          if (!event) continue;
          if (event.type === 'phase') callbacks.onPhase?.(event.phase);
          if (event.type === 'chunk') callbacks.onChunk?.(event.content);
          if (event.type === 'error') throw new MobileSessionStreamError(event.message);
          if (event.type === 'complete') {
            result = {
              response: event.response,
              ...(event.retrieval ? { retrieval: event.retrieval } : {}),
            };
          }
        }
      };

      try {
        while (!result) {
          const { done, value } = await readWithIdleTimeout(reader);
          if (done) {
            consume(parser.push(decoder.decode()));
            consume(parser.finish());
            break;
          }
          consume(parser.push(decoder.decode(value, { stream: true })));
        }
      } finally {
        await reader.cancel().catch(() => undefined);
      }

      if (!result) {
        throw new MobileSessionStreamError('The response ended before completion.');
      }
      const completedResult = result as StreamTextSessionResult;
      if (!completedResult.response.trim()) {
        throw new MobileSessionStreamError('Musee returned an empty response.');
      }
      return completedResult;
    },
  };
}
