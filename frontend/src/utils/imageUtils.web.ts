import { Platform } from 'react-native';

interface CompressImageOptions {
    maxWidth?: number;
    maxHeight?: number;
    quality?: number;
    format?: 'JPEG' | 'PNG';
}

/**
 * Web-compatible image utilities
 */

export async function compressImage(
    uri: string,
    options: CompressImageOptions = {}
): Promise<{ uri: string; width: number; height: number; size: number }> {
    console.log('[ImageUtils.web] Compression requested. Returning original URI.');
    return { uri, width: 0, height: 0, size: 0 };
}

export function shouldCompressImage(uri: string): boolean {
    return false;
}

export function getCompressionSettings(): CompressImageOptions {
    return {
        maxWidth: 1600,
        maxHeight: 1600,
        quality: 75,
        format: 'JPEG',
    };
}

export async function compressImageToSize(
    uri: string,
    maxSizeBytes: number = 4 * 1024 * 1024
): Promise<{ uri: string; width: number; height: number; size: number }> {
    return compressImage(uri);
}

export async function resolvePhUri(uri: string): Promise<string> {
    return uri;
}

export function normalizeImageUri(uri: string): string {
    return uri;
}

export async function ensurePersistentImage(uri: string): Promise<string> {
    return uri;
}
