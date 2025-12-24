import { Asset } from 'react-native-image-picker';

export interface ArtworkMetadata {
    createdTime?: string;
    location?: string;
    latitude?: number;
    longitude?: number;
}

/**
 * Extracts metadata from a react-native-image-picker asset
 */
export function extractMetadataFromAsset(asset: any): ArtworkMetadata {
    const metadata: ArtworkMetadata = {};

    if (asset.timestamp) {
        metadata.createdTime = asset.timestamp;
    }

    if (asset.latitude !== undefined && asset.longitude !== undefined) {
        metadata.latitude = asset.latitude as number;
        metadata.longitude = asset.longitude as number;
        metadata.location = `${(asset.latitude as number).toFixed(6)}, ${(asset.longitude as number).toFixed(6)}`;
    }

    return metadata;
}

/**
 * Formats a date string or timestamp into a consistent ISO format if possible
 */
export function formatMetadataTime(time?: string): string | undefined {
    if (!time) return undefined;
    try {
        const date = new Date(time);
        return date.toISOString();
    } catch (e) {
        return time;
    }
}
