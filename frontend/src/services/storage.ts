import AsyncStorage from '@react-native-async-storage/async-storage';

export interface ArtworkAnalysis {
  id: string;
  photoUri: string;
  artistName: string;
  artistConfidence?: number;
  analysisText?: string;
  tone?: string;
  model?: string;
  timestamp: string;
}

const STORAGE_KEYS = {
  ANALYSES: '@musee:analyses',
  PHOTOS: '@musee:photos',
};

/**
 * Save artwork analysis to local storage
 */
export const saveAnalysis = async (analysis: ArtworkAnalysis): Promise<void> => {
  try {
    const existing = await getAnalyses();
    const updated = [analysis, ...existing];
    await AsyncStorage.setItem(STORAGE_KEYS.ANALYSES, JSON.stringify(updated));
  } catch (error) {
    console.error('Error saving analysis:', error);
    throw error;
  }
};

/**
 * Get all saved analyses
 */
export const getAnalyses = async (): Promise<ArtworkAnalysis[]> => {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.ANALYSES);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error getting analyses:', error);
    return [];
  }
};

/**
 * Get a single analysis by ID
 */
export const getAnalysisById = async (id: string): Promise<ArtworkAnalysis | null> => {
  try {
    const analyses = await getAnalyses();
    return analyses.find(a => a.id === id) || null;
  } catch (error) {
    console.error('Error getting analysis by ID:', error);
    return null;
  }
};

/**
 * Delete an analysis by ID
 */
export const deleteAnalysis = async (id: string): Promise<void> => {
  try {
    const analyses = await getAnalyses();
    const filtered = analyses.filter(a => a.id !== id);
    await AsyncStorage.setItem(STORAGE_KEYS.ANALYSES, JSON.stringify(filtered));
  } catch (error) {
    console.error('Error deleting analysis:', error);
    throw error;
  }
};

/**
 * Clear all analyses
 */
export const clearAllAnalyses = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(STORAGE_KEYS.ANALYSES);
  } catch (error) {
    console.error('Error clearing analyses:', error);
    throw error;
  }
};

/**
 * Search analyses by artist name
 */
export const searchAnalysesByArtist = async (query: string): Promise<ArtworkAnalysis[]> => {
  try {
    const analyses = await getAnalyses();
    const lowerQuery = query.toLowerCase();
    return analyses.filter(a =>
      a.artistName.toLowerCase().includes(lowerQuery)
    );
  } catch (error) {
    console.error('Error searching analyses:', error);
    return [];
  }
};

/**
 * Get storage statistics
 */
export const getStorageStats = async (): Promise<{
  totalAnalyses: number;
  uniqueArtists: number;
  oldestAnalysis?: string;
  newestAnalysis?: string;
}> => {
  try {
    const analyses = await getAnalyses();
    const uniqueArtists = new Set(analyses.map(a => a.artistName)).size;

    return {
      totalAnalyses: analyses.length,
      uniqueArtists,
      oldestAnalysis: analyses[analyses.length - 1]?.timestamp,
      newestAnalysis: analyses[0]?.timestamp,
    };
  } catch (error) {
    console.error('Error getting storage stats:', error);
    return {
      totalAnalyses: 0,
      uniqueArtists: 0,
    };
  }
};
