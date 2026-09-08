import {
  createSseParser,
  parseArtworkAnalysisStreamEvent,
  type ApiClient,
  type ArtworkAnalysisMetrics,
  type ArtworkAnalysisResult,
} from '@musee/client-core';

import type { NativeImageAsset } from './types';

export type MobileArtworkAnalysisProgress =
  | { type: 'chunk'; content: string }
  | { type: 'metrics'; metrics: ArtworkAnalysisMetrics };

export type MobileArtworkAnalysisTransport = {
  analyzeArtwork: (
    artworkId: string,
    onProgress?: (progress: MobileArtworkAnalysisProgress) => void,
    labelAsset?: NativeImageAsset,
  ) => Promise<ArtworkAnalysisResult>;
};

export type MobileArtworkAnalysisTransportOptions = {
  apiBaseUrl: string;
  apiClient: ApiClient;
  createUploadFile?: (uri: string) => Blob;
};

const ANALYSIS_TIMEOUT_MS = 180_000;
const ANALYSIS_FAILED_MESSAGE = 'Musee could not analyze this artwork.';

export class MobileArtworkAnalysisError extends Error {
  readonly status: number | null;

  constructor(message = ANALYSIS_FAILED_MESSAGE, status: number | null = null) {
    super(message);
    this.name = 'MobileArtworkAnalysisError';
    this.status = status;
  }
}

async function readErrorDetail(response: Response): Promise<string> {
  try {
    const body = await response.json() as { detail?: string };
    return body.detail || ANALYSIS_FAILED_MESSAGE;
  } catch {
    return ANALYSIS_FAILED_MESSAGE;
  }
}

export function createMobileArtworkAnalysisTransport({
  apiBaseUrl,
  apiClient,
  createUploadFile,
}: MobileArtworkAnalysisTransportOptions): MobileArtworkAnalysisTransport {
  return {
    async analyzeArtwork(artworkId, onProgress, labelAsset) {
      const formData = new FormData();
      formData.append('client_type', 'ios');
      if (labelAsset) {
        if (!createUploadFile) throw new MobileArtworkAnalysisError('Label upload is unavailable.');
        formData.append('artwork_id', artworkId);
        formData.append('label_image', createUploadFile(labelAsset.uri), labelAsset.fileName);
        const response = await apiClient.fetchWithTimeout(`${apiBaseUrl}/artworks/analyze`, {
          method: 'POST', body: formData, credentials: 'omit', timeout: ANALYSIS_TIMEOUT_MS,
        });
        if (!response.ok) throw new MobileArtworkAnalysisError(await readErrorDetail(response), response.status);
        return response.json() as Promise<ArtworkAnalysisResult>;
      }
      const response = await apiClient.fetchWithTimeout(
        `${apiBaseUrl}/artworks/${encodeURIComponent(artworkId)}/analyze-stream`,
        {
          method: 'POST',
          body: formData,
          credentials: 'omit',
          timeout: ANALYSIS_TIMEOUT_MS,
        },
      );
      if (!response.ok) {
        throw new MobileArtworkAnalysisError(
          await readErrorDetail(response),
          response.status,
        );
      }

      const reader = response.body?.getReader();
      if (!reader) throw new MobileArtworkAnalysisError('Analysis stream is unavailable.');
      const decoder = new TextDecoder();
      const parser = createSseParser();
      let result: ArtworkAnalysisResult | null = null;

      const consume = (messages: ReturnType<typeof parser.push>) => {
        for (const message of messages) {
          const event = parseArtworkAnalysisStreamEvent(message);
          if (!event) continue;
          if (event.type === 'error') throw new MobileArtworkAnalysisError(event.message);
          if (event.type === 'complete') result = event.result;
          if (event.type === 'chunk' || event.type === 'metrics') onProgress?.(event);
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        consume(parser.push(decoder.decode(value, { stream: true })));
      }
      consume(parser.push(decoder.decode()));
      consume(parser.finish());

      if (!result) {
        throw new MobileArtworkAnalysisError('Analysis ended before a result was received.');
      }
      return result;
    },
  };
}
