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
  resolvedImageUri: string;
  cacheKey: string;
  analysisStatus: 'pending';
  artistName: string;
  artworkName: string;
};
