import type { ArtworkAnalysisStatus } from '@musee/client-core';

export type MobileArtworkRecord = {
  id: string;
  photoUri: string;
  thumbnailUri: string | null;
  resolvedImageUri: string;
  resolvedThumbnailUri: string;
  cacheKey: string;
  thumbnailCacheKey: string;
  artistName: string;
  artworkName: string;
  analysis: string | null;
  analysisStatus: ArtworkAnalysisStatus;
  analysisError: string | null;
  date: string | null;
  medium: string | null;
  movement: string | null;
  periodBucket: string | null;
  tags: string[];
  isDeleted: boolean;
  createdAt: string | null;
};

export type MobileArtworkPage = {
  items: MobileArtworkRecord[];
  total: number;
  offset: number;
  limit: number;
};
