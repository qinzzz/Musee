import ImageResizer from '@bam.tech/react-native-image-resizer';

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
    console.log(`[ImageUtils] Compressing image: ${uri.substring(0, 50)}...`);
    console.log(`[ImageUtils] Max dimensions: ${maxWidth}x${maxHeight}, Quality: ${quality}%, Format: ${format}`);

    const result = await ImageResizer.createResizedImage(
      uri,
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
    maxWidth: 1920,
    maxHeight: 1920,
    quality: 80,
    format: 'JPEG',
  };
}
