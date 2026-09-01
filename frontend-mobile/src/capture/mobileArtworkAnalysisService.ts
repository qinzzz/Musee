import type { MobileArtworkAnalysisTransport } from './mobileArtworkAnalysisTransport';
import type { AnalyzedArtwork, PendingArtworkUpload } from './types';

export type MobileArtworkAnalysisService = {
  analyzeArtwork: (
    artwork: PendingArtworkUpload,
    onChunk?: (content: string) => void,
  ) => Promise<AnalyzedArtwork>;
};

export function createMobileArtworkAnalysisService(
  transport: MobileArtworkAnalysisTransport,
): MobileArtworkAnalysisService {
  return {
    async analyzeArtwork(artwork, onChunk) {
      const result = await transport.analyzeArtwork(artwork.id, (progress) => {
        if (progress.type === 'chunk') onChunk?.(progress.content);
      });
      return {
        ...artwork,
        analysisStatus: 'analyzed',
        artistName: result.artist_name,
        artworkName: result.artwork_name,
        analysis: result.analysis,
        date: result.date,
        medium: result.medium,
        tags: result.tags,
      };
    },
  };
}
