import { Platform } from 'react-native';
const ImageResizer = Platform.OS === 'web' ? null : require('@bam.tech/react-native-image-resizer').default;
const RNFS = Platform.OS === 'web' ? null : require('react-native-fs');

interface CompressImageOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  format?: 'JPEG' | 'PNG';
}

/**
 * Compress an image to reduce file size for uploading
 *
 * @param uri - The original image URI (can be ph:// or file://)
 * @param options - Compression options
 * @returns Compressed image URI and size info
 */
export async function compressImage(
  uri: string,
  options: CompressImageOptions = {}
): Promise<{ uri: string; width: number; height: number; size: number }> {
  const {
    maxWidth = 1920,
    maxHeight = 1920,
    quality = 80,
    format = 'JPEG',
  } = options;

  try {
    if (Platform.OS === 'web') {
      console.log('[ImageUtils] Web compression requested. Returning original URI for now.');
      // Web implementation could use Canvas, but for now we return the original.
      return { uri, width: 0, height: 0, size: 0 };
    }

    // Ensure ph:// is resolved to a readable file://
    const resolvedUri = await resolvePhUri(uri);

    console.log(`[ImageUtils] Compressing image: ${resolvedUri.substring(0, 50)}...`);
    console.log(`[ImageUtils] Max dimensions: ${maxWidth}x${maxHeight}, Quality: ${quality}%, Format: ${format}`);

    const result = await ImageResizer.createResizedImage(
      resolvedUri,
      maxWidth,
      maxHeight,
      format,
      quality,
      0, // rotation
      undefined, // outputPath
      false, // keepMeta
      {
        mode: 'contain', // Preserve aspect ratio, fit within dimensions
        onlyScaleDown: true, // Don't upscale small images
      }
    );

    const fileSizeKB = (result.size / 1024).toFixed(2);
    const fileSizeMB = (result.size / (1024 * 1024)).toFixed(2);
    console.log(`[ImageUtils] Compressed image: ${result.width}x${result.height}, Size: ${fileSizeKB}KB (${fileSizeMB}MB)`);

    return {
      uri: result.uri,
      width: result.width,
      height: result.height,
      size: result.size,
    };
  } catch (error) {
    console.error('[ImageUtils] Failed to compress image:', error);
    console.log('[ImageUtils] Falling back to original URI');

    // If compression fails, return original URI
    return {
      uri,
      width: 0,
      height: 0,
      size: 0,
    };
  }
}

/**
 * Check if image compression is needed based on estimated size
 * High-res photos from ph:// URIs are usually large
 */
export function shouldCompressImage(uri: string): boolean {
  // Always compress ph:// URIs as they can be very large (original quality)
  if (uri.startsWith('ph://')) {
    return true;
  }

  // file:// URIs from camera might already be compressed, but compress to be safe
  if (uri.startsWith('file://')) {
    return true;
  }

  return false;
}

/**
 * Get optimal compression settings for API upload
 * Vercel has a 4.5MB limit, so we target ~3MB max to be safe
 */
export function getCompressionSettings(): CompressImageOptions {
  return {
    maxWidth: 1600,
    maxHeight: 1600,
    quality: 75,
    format: 'JPEG',
  };
}

/**
 * Compress image with multiple quality passes if needed to stay under size limit
 * @param uri - Original image URI
 * @param maxSizeBytes - Maximum file size in bytes (default: 4MB to be safe for 4.5MB limit)
 */
export async function compressImageToSize(
  uri: string,
  maxSizeBytes: number = 4 * 1024 * 1024 // 4MB
): Promise<{ uri: string; width: number; height: number; size: number }> {
  // Try initial compression
  let result = await compressImage(uri, getCompressionSettings());

  // If still too large, try more aggressive compression
  if (result.size > maxSizeBytes) {
    console.log(`[ImageUtils] Image still too large (${(result.size / 1024 / 1024).toFixed(2)}MB), trying more aggressive compression...`);

    result = await compressImage(uri, {
      maxWidth: 1280,
      maxHeight: 1280,
      quality: 65,
      format: 'JPEG',
    });
  }

  // Last resort: very aggressive compression
  if (result.size > maxSizeBytes) {
    console.log(`[ImageUtils] Image STILL too large (${(result.size / 1024 / 1024).toFixed(2)}MB), trying maximum compression...`);

    result = await compressImage(uri, {
      maxWidth: 1024,
      maxHeight: 1024,
      quality: 60,
      format: 'JPEG',
    });
  }

  if (result.size > maxSizeBytes) {
    console.warn(`[ImageUtils] WARNING: Image is ${(result.size / 1024 / 1024).toFixed(2)}MB, may exceed API limit!`);
  }

  return result;
}
/**
 * Resolves a ph:// URI into a readable file:// URI for tools that don't support ph://
 */
export async function resolvePhUri(uri: string): Promise<string> {
  if (Platform.OS === 'web' || !uri.startsWith('ph://')) return uri;

  try {
    console.log(`[ImageUtils] Resolving ph:// URI: ${uri}`);
    const identifier = uri.replace('ph://', '');
    const tempPath = `${RNFS.CachesDirectoryPath}/ph_resolve_${Date.now()}.jpg`;

    // Attempt 1: RNFS copyAssetsFileIOS (Standard path)
    try {
      await RNFS.copyAssetsFileIOS(identifier, tempPath, 0, 0);
      if (await RNFS.exists(tempPath)) {
        console.log(`[ImageUtils] Successfully resolved via RNFS: file://${tempPath}`);
        return `file://${tempPath}`;
      }
    } catch (rnfsError) {
      console.warn(`[ImageUtils] RNFS resolution failed for ${identifier}`, rnfsError);
    }

    // Attempt 2: ImageResizer (High reliability on iOS for ph://)
    try {
      console.log(`[ImageUtils] Attempting ImageResizer resolution for ${uri}`);
      const resized = await ImageResizer.createResizedImage(
        uri,
        2000, // High quality for resolution
        2000,
        'JPEG',
        90,
        0,
        undefined,
        false,
        { mode: 'contain', onlyScaleDown: true }
      );
      if (resized && resized.uri) {
        console.log(`[ImageUtils] Successfully resolved via ImageResizer: ${resized.uri}`);
        return resized.uri;
      }
    } catch (resizerError) {
      console.warn(`[ImageUtils] ImageResizer resolution failed for ${uri}`, resizerError);
    }

    // Attempt 3: Fetch bridge (Only as last resort, and not for ph:// if we can help it)
    // Note: ph:// is NOT supported by standard fetch on most iOS RN versions
    if (!uri.startsWith('ph://')) {
      try {
        console.log(`[ImageUtils] Attempting fetch resolution for ${uri}`);
        const response = await fetch(uri);
        const blob = await response.blob();

        const reader = new FileReader();
        const base64Data = await new Promise<string>((resolve, reject) => {
          reader.onloadend = () => {
            const base64 = (reader.result as string).split(',')[1];
            resolve(base64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });

        await RNFS.writeFile(tempPath, base64Data, 'base64');
        return `file://${tempPath}`;
      } catch (fetchError) {
        console.warn(`[ImageUtils] Fetch resolution failed for ${uri}`, fetchError);
      }
    }

  } catch (globalError) {
    console.error(`[ImageUtils] Global error in resolvePhUri: ${globalError}`);
  }

  return uri; // Fallback to original
}

/**
 * Normalizes an image URI, especially for iOS local file paths that might have become invalid
 * due to the App Container UUID changing after a new build/install.
 */
export function normalizeImageUri(uri: string): string {
  if (!uri || Platform.OS === 'web') return uri;

  // Only handle iOS absolute file paths in the app sandbox
  if (!uri.startsWith('file:///var/mobile/Containers/Data/Application/')) {
    return uri;
  }

  try {
    // Find the segment after the UUID
    // Example: file:///var/mobile/Containers/Data/Application/OLD-UUID/tmp/photo.jpg
    const segments = uri.split('/');
    const applicationIndex = segments.indexOf('Application');

    if (applicationIndex === -1 || applicationIndex + 2 >= segments.length) {
      return uri;
    }

    // The relative path starts after the UUID (segments[applicationIndex + 1])
    const relativePart = segments.slice(applicationIndex + 2).join('/');

    // Get the current app container root
    // RNFS.DocumentDirectoryPath is usually .../Documents
    // We want the parent of Documents
    const currentDocPath = RNFS.DocumentDirectoryPath;
    const currentAppRoot = currentDocPath.replace(/\/Documents$/, '');

    const normalizedUri = `${currentAppRoot}/${relativePart}`;

    // Log only once per session or sparingly to avoid noise
    // console.log(`[ImageUtils] Normalized URI from ${segments[applicationIndex + 1].substring(0, 8)}... to current sandbox`);

    return normalizedUri;
  } catch (error) {
    console.error('[ImageUtils] Error normalizing URI:', error);
    return uri;
  }
}

/**
 * Ensures an image is stored in a permanent directory (Documents/Musee/Photos).
 * If the image is currently in a temporary directory (tmp or Caches), it will be moved.
 */
export async function ensurePersistentImage(uri: string): Promise<string> {
  if (!uri || Platform.OS === 'web' || !uri.startsWith('file://')) return uri;

  try {
    const isTemp = uri.includes('/tmp/') || uri.includes('/Caches/');
    if (!isTemp) return uri;

    const fileName = uri.split('/').pop() || `photo_${Date.now()}.jpg`;
    const photoDir = `${RNFS.DocumentDirectoryPath}/Musee/Photos`;
    const destPath = `${photoDir}/${fileName}`;

    // Create directory if it doesn't exist
    const dirExists = await RNFS.exists(photoDir);
    if (!dirExists) {
      await RNFS.mkdir(photoDir);
    }

    // Copy the file to the permanent location
    const sourcePath = uri.replace('file://', '');

    // If destination already exists, return it (avoid redundant copies)
    if (await RNFS.exists(destPath)) {
      return `file://${destPath}`;
    }

    await RNFS.copyFile(sourcePath, destPath);
    console.log(`[ImageUtils] Persisted image to: ${destPath}`);

    return `file://${destPath}`;
  } catch (error) {
    console.error('[ImageUtils] Error persisting image:', error);
    return uri; // Fallback to original
  }
}
