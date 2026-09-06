export const CLIENT_CORE_VERSION = '0.0.0';

export {
  parseArtworkAnalysisStreamEvent,
  type ArtworkAnalysisMetrics,
  type ArtworkAnalysisResult,
  type ArtworkAnalysisStatus,
  type ArtworkAnalysisStreamEvent,
} from './artworkAnalysis';
export {
  retryArtworkBatchEntry,
  runArtworkBatch,
  type ArtworkBatchEntry,
  type ArtworkBatchOperations,
  type ArtworkBatchStatus,
  type ArtworkBatchTransition,
} from './artworkBatch';
export {
  fetchArtworkById,
  fetchArtworkPage,
  type ArtworkPage,
  type ArtworkPageRequest,
  type ArtworkRecord,
  type ArtworkTagRecord,
} from './artworkLibrary';

export {
  createApiClient,
  type ApiClient,
  type ApiClientOptions,
  type ApiFetch,
  type ApiRequestOptions,
} from './apiClient';
export {
  ApiHttpError,
  fetchBackendHealth,
  resolveBackendOrigin,
  type BackendHealth,
} from './health';
export {
  classifyRequestFailure,
  type RequestFailureKind,
} from './requestFailure';
export {
  createSseParser,
  type SseMessage,
  type SseParser,
} from './sse';
export {
  buildInitialSessionTitle,
  parseSessionChatStreamEvent,
  type SessionChatPhase,
  type SessionChatStreamEvent,
  type SessionEventRecord,
  type SessionEventType,
  type SessionRecord,
  type SessionResponseStatus,
  type SessionRole,
} from './session';
