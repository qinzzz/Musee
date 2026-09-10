import { throwIfRequestCancelled } from '../api/requestCancellation';
import type { SessionRecord } from '@musee/client-core';
import type { MobileSessionService, MobileTextSessionAttempt } from './mobileSessionService';
import { ApiHttpError, createSessionContextJob, type ContextEntry } from '@musee/client-core';
import type { MobileArtworkAnalysisService } from '../capture/mobileArtworkAnalysisService';
import type { MobileArtworkUploadService } from '../capture/mobileArtworkUploadService';
import type { NativeImageAsset } from '../capture/types';
import { mapPendingMobileArtwork, toPendingArtworkUpload, type MobileArtworkLibraryService } from '../library/mobileArtworkLibraryService';
import type { MobileArtworkRecord } from '../library/types';

export const MAX_SESSION_ATTACHMENTS = 5;
export type SessionContextInput =
  | { kind: 'local'; asset: NativeImageAsset; labelAsset?: NativeImageAsset }
  | { kind: 'library'; artwork: MobileArtworkRecord };
export type ResolvedArtworkContext = {
  artwork: MobileArtworkRecord;
  labelAsset?: NativeImageAsset;
  source: 'capture' | 'upload' | 'library';
};
export type MobileContextEntry = ContextEntry<SessionContextInput, ResolvedArtworkContext>;

export function createMobileSessionContextService(dependencies: {
  upload: MobileArtworkUploadService;
  analysis: MobileArtworkAnalysisService;
  library: MobileArtworkLibraryService;
  sessions: MobileSessionService;
}) {
  async function enrichArtwork(artworkId: string, allowDeleted = false, labelAsset?: NativeImageAsset, signal?: AbortSignal) {
    // Re-read before retry: analysis may have succeeded despite a lost response.
    let artwork = await dependencies.library.fetchArtwork(artworkId);
    throwIfRequestCancelled(signal);
    if (artwork.isDeleted) {
      if (allowDeleted) return artwork;
      throw new Error('This artwork has been deleted.');
    }
    if (artwork.analysisStatus !== 'analyzed') {
      await dependencies.analysis.analyzeArtwork({ ...toPendingArtworkUpload(artwork), ...(labelAsset ? { labelAsset } : {}) });
      throwIfRequestCancelled(signal);
      artwork = await dependencies.library.fetchArtwork(artwork.id);
    }
    return artwork;
  }

  const service = {
    createJob<C>(
      inputs: SessionContextInput[],
      userId: string,
      requestId: string,
      commit: (entries: ResolvedArtworkContext[]) => Promise<C>,
    ) {
      if (!inputs.length || inputs.length > MAX_SESSION_ATTACHMENTS) {
        throw new Error(`Choose between 1 and ${MAX_SESSION_ATTACHMENTS} attachments.`);
      }
      return createSessionContextJob<SessionContextInput, ResolvedArtworkContext, C>(
        inputs.map((input, index) => ({ id: `${requestId}:${index}`, input })),
        {
          async resolve(input, id) {
            if (input.kind === 'library') {
              const artwork = await dependencies.library.fetchArtwork(input.artwork.id);
              if (artwork.isDeleted) throw new Error('This artwork has been deleted.');
              return { artwork, source: 'library' };
            }
            const saved = await dependencies.upload.uploadArtwork(input.asset, userId, undefined, id);
            return {
              artwork: mapPendingMobileArtwork(saved),
              ...(input.labelAsset ? { labelAsset: input.labelAsset } : {}),
              source: input.asset.source === 'camera' ? 'capture' : 'upload',
            };
          },
          async enrich(resolved) {
            const artwork = await enrichArtwork(resolved.artwork.id, false, resolved.labelAsset);
            return { artwork, source: resolved.source };
          },
        },
        commit,
      );
    },
  };
  return {
    ...service,
    async recoverTurn(artworkIds: string[], signal?: AbortSignal) {
      const artworks: MobileArtworkRecord[] = [];
      for (const id of new Set(artworkIds)) {
        throwIfRequestCancelled(signal);
        try {
          artworks.push(await enrichArtwork(id, true, undefined, signal));
        } catch (error) {
          // Deleted references remain in the canonical timeline; there is nothing to analyze.
          if (!(error instanceof ApiHttpError) || error.status !== 404) throw error;
        }
      }
      return artworks;
    },
    createTurn(inputs: SessionContextInput[], userId: string, text: string, initialSession: SessionRecord | null) {
      const sessionId = initialSession?.id || dependencies.sessions.createSessionId();
      const requestId = dependencies.sessions.createSessionId();
      let session = initialSession;
      let attempt: MobileTextSessionAttempt | undefined;
      const linked = new Set<string>();
      return service.createJob(inputs, userId, requestId, async (entries) => {
        attempt ??= dependencies.sessions.createContextAttempt(userId,
          entries.map((entry) => ({ artwork_id: entry.artwork.id, source: entry.source })), text, sessionId);
        if (!session) {
          session = await dependencies.sessions.startArtworkSession(userId, entries[0].artwork.id, sessionId, attempt.title);
          linked.add(entries[0].artwork.id);
        }
        for (const entry of entries) {
          if (linked.has(entry.artwork.id)) continue;
          await dependencies.sessions.attachArtwork(userId, sessionId, entry.artwork.id);
          linked.add(entry.artwork.id);
        }
        await dependencies.sessions.persistContextTurn(attempt);
        return { attempt, session };
      });
    },
  };
}
