import { useCallback, useEffect, useState } from 'react';
import { analyzeArtworkFromExisting } from '../../api/analysis';
import { getArtworkFunFacts } from '../../api/artworks';
import type { GalleryItem } from '../../types';
import type { ArtworkAnalysisResult } from '../../api/analysis';
import type { ArtworkDetailItem, IdentifyAgainHints, IdentifyAgainValues } from '../types';
import type { ArtworkStatePatch } from '../lib/artworkState';

type UseArtworkAnalysisOptions = {
  artworkDetailItem: ArtworkDetailItem | null;
  updateSavedArtworkInState: (targetId: string, patch: ArtworkStatePatch) => void;
  applyArtworkAnalysisResult: (
    itemId: string,
    analysis: ArtworkAnalysisResult,
    extras?: Partial<GalleryItem>,
  ) => ArtworkStatePatch;
  markArtworkAnalysisFailed: (itemId: string, message: string) => void;
};

export function useArtworkAnalysis({
  artworkDetailItem,
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

  const hydrateFunFacts = useCallback((itemId: string) => {
    const targetItem = artworkDetailItem?.id === itemId ? artworkDetailItem : null;
    getArtworkFunFacts(targetItem?.artworkId || itemId)
      .then((funFacts) => {
        if (funFacts.length > 0) {
          updateSavedArtworkInState(itemId, {
            record: { insights: funFacts },
          });
        }
      })
      .catch(() => {});
  }, [artworkDetailItem, updateSavedArtworkInState]);

  const handleRetryAnalysis = useCallback(async (item: GalleryItem) => {
    const itemId = item.id;
    updateSavedArtworkInState(itemId, {
      clientState: {
        isAnalyzing: true,
        analysisStatus: 'analyzing',
        analysisError: undefined,
        streamingText: undefined,
        syncStatus: 'synced',
      },
    });

    try {
      const analysis = await analyzeArtworkFromExisting(item.artworkId || item.id);
      applyArtworkAnalysisResult(itemId, analysis, {
        sessionLinks: item.sessionLinks,
      });
      if (analysis.artist_name && analysis.artist_name !== 'Unknown Artist') {
        hydrateFunFacts(itemId);
      }
    } catch {
      markArtworkAnalysisFailed(itemId, 'Retry failed.');
    }
  }, [applyArtworkAnalysisResult, hydrateFunFacts, markArtworkAnalysisFailed, updateSavedArtworkInState]);

  const handleIdentifyAgain = useCallback(async (hints?: IdentifyAgainHints) => {
    if (!artworkDetailItem?.artworkId) return;

    const targetItem = artworkDetailItem;
    updateSavedArtworkInState(targetItem.id, {
      clientState: {
        isAnalyzing: true,
        analysisStatus: 'reidentifying',
        analysisError: undefined,
      },
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
      if (result.artist_name && result.artist_name !== 'Unknown Artist') {
        hydrateFunFacts(targetItem.id);
      }
    } catch (error) {
      console.error('Failed to identify artwork again:', error);
      markArtworkAnalysisFailed(targetItem.id, 'Identify again failed.');
      throw error;
    }
  }, [applyArtworkAnalysisResult, artworkDetailItem, hydrateFunFacts, markArtworkAnalysisFailed, updateSavedArtworkInState]);

  const openHeaderIdentifyAgainModal = useCallback(() => {
    if (!artworkDetailItem || artworkDetailItem.isAnalyzing || artworkDetailItem.deleteStatus === 'pending') return;

    setHeaderIdentifyAgainValues({
      artist: artworkDetailItem.artistName || '',
      title: artworkDetailItem.artworkName || '',
      additionalClue: '',
    });
    setHeaderIdentifyAgainError(null);
    setShowHeaderIdentifyAgainModal(true);
  }, [artworkDetailItem]);

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
    if (!artworkDetailItem?.artworkId || isHeaderIdentifyingAgain) return;

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
  }, [artworkDetailItem?.artworkId, handleIdentifyAgain, headerIdentifyAgainValues, isHeaderIdentifyingAgain]);

  useEffect(() => {
    if (artworkDetailItem) return;
    setShowHeaderIdentifyAgainModal(false);
    setHeaderIdentifyAgainError(null);
    setIsHeaderIdentifyingAgain(false);
  }, [artworkDetailItem]);

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
