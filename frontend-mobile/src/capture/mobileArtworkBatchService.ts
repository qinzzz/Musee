import { throwIfRequestCancelled } from '../api/requestCancellation';
import {
  retryArtworkBatchEntry,
  runArtworkBatch,
  type ArtworkBatchEntry,
  type ArtworkBatchTransition,
} from '@musee/client-core';

import type { MobileArtworkAnalysisService } from './mobileArtworkAnalysisService';
import type { MobileArtworkUploadService } from './mobileArtworkUploadService';
import type { AnalyzedArtwork, NativeImageAsset, PendingArtworkUpload } from './types';

export type MobileArtworkBatchEntry = ArtworkBatchEntry<
  NativeImageAsset,
  PendingArtworkUpload,
  AnalyzedArtwork
>;

export type MobileArtworkBatchTransition = ArtworkBatchTransition<
  NativeImageAsset,
  PendingArtworkUpload,
  AnalyzedArtwork
>;

export type MobileArtworkBatchService = {
  createEntries: (assets: NativeImageAsset[]) => MobileArtworkBatchEntry[];
  process: (
    entries: MobileArtworkBatchEntry[],
    userId: string,
    onTransition?: MobileArtworkBatchTransition,
    signal?: AbortSignal,
  ) => Promise<MobileArtworkBatchEntry[]>;
  retry: (
    entry: MobileArtworkBatchEntry,
    userId: string,
    onTransition?: (entry: MobileArtworkBatchEntry) => void,
    signal?: AbortSignal,
  ) => Promise<MobileArtworkBatchEntry>;
};

type MobileArtworkBatchServiceOptions = {
  analysisService: MobileArtworkAnalysisService;
  uploadService: MobileArtworkUploadService;
  createId?: () => string;
};

function defaultId(): string {
  return `mobile-batch-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createMobileArtworkBatchService({
  analysisService,
  uploadService,
  createId = defaultId,
}: MobileArtworkBatchServiceOptions): MobileArtworkBatchService {
  const operations = (userId: string, signal?: AbortSignal) => ({
    upload: (asset: NativeImageAsset) => { throwIfRequestCancelled(signal); return uploadService.uploadArtwork(asset, userId); },
    analyze: (artwork: PendingArtworkUpload) => { throwIfRequestCancelled(signal); return analysisService.analyzeArtwork(artwork); },
  });

  return {
    createEntries: (assets) => assets.map((asset) => ({
      id: createId(),
      input: asset,
      status: 'queued',
    })),
    process: (entries, userId, onTransition, signal) => (
      runArtworkBatch(entries, operations(userId, signal), onTransition)
    ),
    retry: (entry, userId, onTransition, signal) => (
      retryArtworkBatchEntry(entry, operations(userId, signal), onTransition)
    ),
  };
}
