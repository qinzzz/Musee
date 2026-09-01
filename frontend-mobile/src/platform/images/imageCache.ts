import { Image } from 'expo-image';

export type ImageCache = {
  write: (localUri: string, cacheKey: string) => Promise<void>;
};

export const expoImageCache: ImageCache = {
  write: (localUri, cacheKey) => Image.writeToCacheAsync(localUri, cacheKey),
};
