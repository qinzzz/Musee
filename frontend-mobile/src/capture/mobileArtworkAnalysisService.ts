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
      const onProgress: Parameters<MobileArtworkAnalysisTransport['analyzeArtwork']>[1] = (progress) => {
        if (progress.type === 'chunk') onChunk?.(progress.content);
      };
      const result = await (artwork.labelAsset
        ? transport.analyzeArtwork(artwork.id, onProgress, artwork.labelAsset)
        : transport.analyzeArtwork(artwork.id, onProgress));
      const { labelAsset: _labelAsset, ...savedArtwork } = artwork;
      return {
        ...savedArtwork,
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
