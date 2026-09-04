import {
  buildInitialSessionTitle,
  type ArtworkRecord,
  type SessionChatPhase,
  type SessionEventRecord,
  type SessionRecord,
} from '@musee/client-core';

import {
  MobileSessionHttpError,
  type MobileSessionTransport,
  type StreamTextSessionResult,
} from './mobileSessionTransport';
import { toPendingSessionResponse } from './sessionEventState';

export type MobileTextSessionAttempt = {
  responseEvent: SessionEventRecord;
  sessionId: string;
  text: string;
  title: string;
  userEvent: SessionEventRecord;
  userId: string;
};

export type SessionArtworkInputSource = 'capture' | 'library' | 'upload';
export type MobileSessionService = {
  attachArtwork: (userId: string, sessionId: string, artworkId: string) => Promise<void>;
  createSessionId: () => string;
  createTextAttempt: (
    userId: string,
    text: string,
    sessionId?: string,
  ) => MobileTextSessionAttempt;
  createArtworkAttempt: (
    userId: string,
    artworkId: string,
    source: SessionArtworkInputSource,
    text: string,
    sessionId: string,
  ) => MobileTextSessionAttempt;
  fetchArtworks: (sessionId: string, userId: string) => Promise<ArtworkRecord[]>;
  fetchEvents: (sessionId: string) => Promise<SessionEventRecord[]>;
  fetchSessions: (userId: string) => Promise<SessionRecord[]>;
  startArtworkSession: (
    userId: string,
    artworkId: string,
    sessionId: string,
    title: string,
  ) => Promise<SessionRecord>;
  persistPendingResponse: (
    attempt: MobileTextSessionAttempt,
    replaceExisting?: boolean,
  ) => Promise<void>;
  persistResponse: (
    attempt: MobileTextSessionAttempt,
    status: 'completed' | 'failed',
    result?: StreamTextSessionResult,
    errorMessage?: string,
  ) => Promise<SessionEventRecord>;
  persistUserInput: (
    attempt: MobileTextSessionAttempt,
    existingSession: SessionRecord | null,
  ) => Promise<SessionRecord>;
  streamResponse: (
    attempt: MobileTextSessionAttempt,
    callbacks?: {
      onChunk?: (chunk: string) => void;
      onPhase?: (phase: SessionChatPhase) => void;
    },
  ) => Promise<StreamTextSessionResult>;
};

export type MobileSessionServiceOptions = {
  createId?: (prefix: 'event' | 'response' | 'session') => string;
  now?: () => Date;
  transport: MobileSessionTransport;
};

const DEFAULT_SESSION_TITLE = 'New Session';
function defaultCreateId(prefix: 'event' | 'response' | 'session'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function toEventWrite(event: SessionEventRecord) {
  return {
    id: event.id,
    role: event.role,
    event_type: event.event_type,
    content: event.content,
    artwork_ids: event.artwork_ids,
    trigger_event_id: event.trigger_event_id,
    payload: event.payload,
  };
}

export function restoreTextSessionAttempt(
  responseEvent: SessionEventRecord,
  events: SessionEventRecord[],
  session: SessionRecord,
  userId: string,
): MobileTextSessionAttempt | null {
  const triggerEventId = responseEvent.trigger_event_id;
  const userEvent = triggerEventId
    ? events.find((event) => event.id === triggerEventId)
    : null;
  const content = userEvent?.content?.trim();
  const hasArtwork = Boolean(userEvent?.artwork_ids?.length);
  const text = content || '';
  if (!userEvent || userEvent.event_type !== 'user_input' || (!text && !hasArtwork)) return null;
  return {
    sessionId: session.id,
    userId,
    text,
    title: session.title,
    userEvent,
    responseEvent: toPendingSessionResponse(responseEvent),
  };
}

export function createMobileSessionService({
  createId = defaultCreateId,
  now = () => new Date(),
  transport,
}: MobileSessionServiceOptions): MobileSessionService {
  return {
    attachArtwork(userId, sessionId, artworkId) {
      return transport.attachArtwork({ userId, sessionId, artworkId });
    },
    createSessionId() {
      return createId('session');
    },
    fetchArtworks: transport.fetchArtworks,
    fetchEvents: transport.fetchEvents,
    fetchSessions: transport.fetchSessions,
    startArtworkSession(userId, artworkId, sessionId, title) {
      return transport.startArtworkSession({ userId, artworkId, sessionId, title });
    },

    createTextAttempt(userId, rawText, existingSessionId) {
      const text = rawText.trim();
      const sessionId = existingSessionId || createId('session');
      const userEventId = createId('event');
      const responseEventId = createId('response');
      const createdAt = now();

      return {
        sessionId,
        userId,
        text,
        title: buildInitialSessionTitle(text, DEFAULT_SESSION_TITLE),
        userEvent: {
          id: userEventId,
          session_id: sessionId,
          role: 'user',
          event_type: 'user_input',
          content: text,
          payload: null,
          trigger_event_id: null,
          created_at: createdAt.toISOString(),
        },
        responseEvent: {
          id: responseEventId,
          session_id: sessionId,
          role: 'model',
          event_type: 'model_response',
          content: '',
          payload: { status: 'pending' },
          trigger_event_id: userEventId,
          created_at: new Date(createdAt.getTime() + 1).toISOString(),
        },
      };
    },

    createArtworkAttempt(
      userId,
      artworkId,
      source,
      rawText,
      sessionId,
    ) {
      const content = rawText.trim();
      const userEventId = createId('event');
      const responseEventId = createId('response');
      const createdAt = now();
      return {
        sessionId,
        userId,
        text: content,
        title: buildInitialSessionTitle(content, DEFAULT_SESSION_TITLE),
        userEvent: {
          id: userEventId,
          session_id: sessionId,
          role: 'user',
          event_type: 'user_input',
          content: content || null,
          artwork_ids: [artworkId],
          payload: { artworks: [{ artwork_id: artworkId, source }] },
          trigger_event_id: null,
          created_at: createdAt.toISOString(),
        },
        responseEvent: {
          id: responseEventId,
          session_id: sessionId,
          role: 'model',
          event_type: 'model_response',
          content: '',
          artwork_ids: [artworkId],
          payload: { status: 'pending' },
          trigger_event_id: userEventId,
          created_at: new Date(createdAt.getTime() + 1).toISOString(),
        },
      };
    },

    async persistUserInput(attempt, existingSession) {
      if (!existingSession) {
        return transport.startTextSession({
          sessionId: attempt.sessionId,
          userId: attempt.userId,
          title: attempt.title,
          event: toEventWrite(attempt.userEvent),
        });
      }
      await transport.appendEvents(attempt.sessionId, [toEventWrite(attempt.userEvent)]);
      return existingSession;
    },

    async persistPendingResponse(attempt, replaceExisting = false) {
      const eventWrite = toEventWrite(attempt.responseEvent);
      if (!replaceExisting) {
        await transport.appendEvents(attempt.sessionId, [eventWrite]);
        return;
      }
      try {
        await transport.updateEvent(
          attempt.sessionId,
          attempt.responseEvent.id,
          eventWrite,
        );
      } catch (error) {
        if (!(error instanceof MobileSessionHttpError) || error.status !== 404) {
          throw error;
        }
        await transport.appendEvents(attempt.sessionId, [eventWrite]);
      }
    },

    streamResponse(attempt, callbacks) {
      return transport.streamTextResponse({
        sessionId: attempt.sessionId,
        triggerEventId: attempt.userEvent.id,
      }, callbacks);
    },

    async persistResponse(attempt, status, result, errorMessage) {
      const responseEvent: SessionEventRecord = {
        ...attempt.responseEvent,
        content: status === 'completed' ? result?.response : '',
        payload: {
          status,
          ...(result?.retrieval ? { retrieval: result.retrieval } : {}),
          ...(errorMessage ? { error_message: errorMessage } : {}),
        },
      };
      const eventWrite = toEventWrite(responseEvent);
      try {
        return await transport.updateEvent(
          attempt.sessionId,
          attempt.responseEvent.id,
          eventWrite,
        );
      } catch (error) {
        if (!(error instanceof MobileSessionHttpError) || error.status !== 404) {
          throw error;
        }
        await transport.appendEvents(attempt.sessionId, [eventWrite]);
        return responseEvent;
      }
    },
  };
}
