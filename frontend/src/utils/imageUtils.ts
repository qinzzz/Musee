import ImageResizer from '@bam.tech/react-native-image-resizer';
import RNFS from 'react-native-fs';

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
  if (!uri.startsWith('ph://')) return uri;

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

    // Attempt 2: Fetch bridge (Special iOS workaround)
    try {
      console.log(`[ImageUtils] Attempting fetch resolution for ${uri}`);
      const response = await fetch(uri);
      const blob = await response.blob();

      // Read blob as base64 and write to file
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
      console.log(`[ImageUtils] Successfully resolved via fetch blob: file://${tempPath}`);
      return `file://${tempPath}`;
    } catch (fetchError) {
      console.warn(`[ImageUtils] Fetch resolution failed for ${uri}`, fetchError);
    }

    // Attempt 3: ImageResizer (Last resort transformation)
    try {
      console.log(`[ImageUtils] Attempting ImageResizer resolution for ${uri}`);
      const resized = await ImageResizer.createResizedImage(
        uri,
        1200, // Reasonable max
        1200,
        'JPEG',
        80
      );
      console.log(`[ImageUtils] Successfully resolved via ImageResizer: ${resized.uri}`);
      return resized.uri;
    } catch (resizerError) {
      console.error(`[ImageUtils] All resolution attempts failed for ${uri}`, resizerError);
    }

  } catch (globalError) {
    console.error(`[ImageUtils] Global error in resolvePhUri: ${globalError}`);
  }

  return uri; // Fallback to original
}
