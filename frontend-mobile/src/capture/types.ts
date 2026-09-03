export type NativeImageSource = 'camera' | 'library';

export type NativeImageAsset = {
  uri: string;
  fileName: string;
  mimeType: string;
  fileSize?: number;
  width: number;
  height: number;
  source: NativeImageSource;
};

export type PendingArtworkUpload = {
  id: string;
  photoUri: string;
  thumbnailUri: string | null;
  resolvedImageUri: string;
  resolvedThumbnailUri: string;
  cacheKey: string;
  thumbnailCacheKey: string;
  analysisStatus: 'pending';
  artistName: string;
  artworkName: string;
};

export type AnalyzedArtwork = Omit<PendingArtworkUpload, 'analysisStatus' | 'artistName' | 'artworkName'> & {
  analysisStatus: 'analyzed';
  artistName: string;
  artworkName: string;
  analysis: string;
  date?: string | null;
  medium?: string | null;
  tags: string[];
};
