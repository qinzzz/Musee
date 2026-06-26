import { useCallback, useEffect, useState } from 'react';
import { analyzeArtworkFromExisting } from '../../api/analysis';
import { fetchAndPersistInsights } from '../../api/artworks';
import type { GalleryItem } from '../../types';
import type { ArtworkAnalysisResult } from '../../api/analysis';
import type { IdentifyAgainHints, IdentifyAgainValues, InterpretingItem } from '../types';

type UseArtworkAnalysisOptions = {
  interpretingItem: InterpretingItem | null;
  updateSavedArtworkInState: (targetId: string, updates: Partial<GalleryItem>) => void;
  applyArtworkAnalysisResult: (
    itemId: string,
    analysis: ArtworkAnalysisResult,
    extras?: Partial<GalleryItem>,
  ) => Partial<GalleryItem>;
  markArtworkAnalysisFailed: (itemId: string, message: string) => void;
};

export function useArtworkAnalysis({
  interpretingItem,
  updateSavedArtworkInState,
  applyArtworkAnalysisResult,
  markArtworkAnalysisFailed,
}: UseArtworkAnalysisOptions) {
  const [showHeaderIdentifyAgainModal, setShowHeaderIdentifyAgainModal] = useState(false);
  const [headerIdentifyAgainValues, setHeaderIdentifyAgainValues] = useState<IdentifyAgainValues>({
    artist: '',
    title: '',
    additionalClue: '',
  });
  const [headerIdentifyAgainError, setHeaderIdentifyAgainError] = useState<string | null>(null);
  const [isHeaderIdentifyingAgain, setIsHeaderIdentifyingAgain] = useState(false);

  const hydrateInsights = useCallback((itemId: string, artworkId?: string) => {
    if (!artworkId) return;

    fetchAndPersistInsights(artworkId)
      .then((insights) => {
        if (insights.length > 0) {
          updateSavedArtworkInState(itemId, { insights });
        }
      })
      .catch(() => {});
  }, [updateSavedArtworkInState]);

  const handleRetryAnalysis = useCallback(async (item: GalleryItem) => {
    const itemId = item.id;
    updateSavedArtworkInState(itemId, {
      isAnalyzing: true,
      analysisStatus: 'analyzing',
      analysisError: undefined,
      streamingText: undefined,
      syncStatus: 'synced',
    });

    try {
      const analysis = await analyzeArtworkFromExisting(item.artworkId || item.id);
      applyArtworkAnalysisResult(itemId, analysis, {
        sessionLinks: item.sessionLinks,
      });
      if (analysis.artist_name && analysis.artist_name !== 'Unknown Artist') {
        hydrateInsights(itemId, analysis.artwork_id || item.artworkId || item.id);
      }
    } catch {
      markArtworkAnalysisFailed(itemId, 'Retry failed.');
    }
  }, [applyArtworkAnalysisResult, hydrateInsights, markArtworkAnalysisFailed, updateSavedArtworkInState]);

  const handleIdentifyAgain = useCallback(async (hints?: IdentifyAgainHints) => {
    if (!interpretingItem?.artworkId) return;

    const targetItem = interpretingItem;
    updateSavedArtworkInState(targetItem.id, {
      isAnalyzing: true,
      analysisStatus: 'reidentifying',
      analysisError: undefined,
    });

    try {
      const result = await analyzeArtworkFromExisting(targetItem.artworkId, {
        artistName: hints?.artistName,
        artworkName: hints?.artworkName,
        additionalClue: hints?.additionalClue,
      });
      applyArtworkAnalysisResult(targetItem.id, result, {
        referenceUrls: result.reference_urls || [],
      });
      hydrateInsights(targetItem.id, result.artwork_id || targetItem.artworkId);
    } catch (error) {
      console.error('Failed to identify artwork again:', error);
      markArtworkAnalysisFailed(targetItem.id, 'Identify again failed.');
      throw error;
    }
  }, [applyArtworkAnalysisResult, hydrateInsights, interpretingItem, markArtworkAnalysisFailed, updateSavedArtworkInState]);

  const openHeaderIdentifyAgainModal = useCallback(() => {
    if (!interpretingItem || interpretingItem.isAnalyzing || interpretingItem.deleteStatus === 'pending') return;

    setHeaderIdentifyAgainValues({
      artist: interpretingItem.artistName || '',
      title: interpretingItem.artworkName || '',
      additionalClue: '',
    });
    setHeaderIdentifyAgainError(null);
    setShowHeaderIdentifyAgainModal(true);
  }, [interpretingItem]);

  const closeHeaderIdentifyAgainModal = useCallback(() => {
    if (isHeaderIdentifyingAgain) return;
    setShowHeaderIdentifyAgainModal(false);
    setHeaderIdentifyAgainError(null);
  }, [isHeaderIdentifyingAgain]);

  const updateHeaderIdentifyAgainValues = useCallback((values: IdentifyAgainValues) => {
    setHeaderIdentifyAgainValues(values);
    setHeaderIdentifyAgainError(null);
  }, []);

  const submitHeaderIdentifyAgain = useCallback(async () => {
    if (!interpretingItem?.artworkId || isHeaderIdentifyingAgain) return;

    const artistName = headerIdentifyAgainValues.artist.trim();
    const artworkName = headerIdentifyAgainValues.title.trim();
    const additionalClue = headerIdentifyAgainValues.additionalClue.trim();

    if (!artistName && !artworkName && !additionalClue) {
      setHeaderIdentifyAgainError('Enter at least one clue to continue.');
      return;
    }

    try {
      setIsHeaderIdentifyingAgain(true);
      setHeaderIdentifyAgainError(null);
      setShowHeaderIdentifyAgainModal(false);
      await handleIdentifyAgain({
        artistName: artistName || undefined,
        artworkName: artworkName || undefined,
        additionalClue: additionalClue || undefined,
      });
    } catch (error) {
      console.error('Failed to identify artwork again from header:', error);
      setHeaderIdentifyAgainError('Could not identify the artwork again.');
    } finally {
      setIsHeaderIdentifyingAgain(false);
    }
  }, [handleIdentifyAgain, headerIdentifyAgainValues, interpretingItem?.artworkId, isHeaderIdentifyingAgain]);

  useEffect(() => {
    if (interpretingItem) return;
    setShowHeaderIdentifyAgainModal(false);
    setHeaderIdentifyAgainError(null);
    setIsHeaderIdentifyingAgain(false);
  }, [interpretingItem]);

  return {
    showHeaderIdentifyAgainModal,
    headerIdentifyAgainValues,
    headerIdentifyAgainError,
    isHeaderIdentifyingAgain,
    handleRetryAnalysis,
    handleIdentifyAgain,
    openHeaderIdentifyAgainModal,
    closeHeaderIdentifyAgainModal,
    updateHeaderIdentifyAgainValues,
    submitHeaderIdentifyAgain,
  };
}
