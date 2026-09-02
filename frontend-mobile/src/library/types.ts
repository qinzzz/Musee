import type { ArtworkAnalysisStatus } from '@musee/client-core';

export type MobileArtworkRecord = {
  id: string;
  photoUri: string;
  resolvedImageUri: string;
  cacheKey: string;
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
  createdAt: string | null;
};

export type MobileArtworkPage = {
  items: MobileArtworkRecord[];
  total: number;
  offset: number;
  limit: number;
};
