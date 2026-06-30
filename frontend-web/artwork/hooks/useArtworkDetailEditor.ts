import { useCallback, useEffect, useRef, useState } from 'react';

import { updateArtwork } from '../../api/artworks';
import type { GalleryItem } from '../../types';
import type {
  ArtworkDetailItem,
  ArtworkMetadataEditValues,
  IdentifyAgainHints,
  IdentifyAgainValues,
} from '../types';

type UseArtworkDetailEditorOptions = {
  item: ArtworkDetailItem;
  onUpdateMetadata?: (id: string, updates: {
    artistName?: string;
    artworkName?: string;
    date?: string;
    medium?: string;
    keywords?: string[];
  }) => void;
  onIdentifyAgain?: (hints?: IdentifyAgainHints) => Promise<void>;
  editRequestToken?: number;
};

function getEditValues(item: ArtworkDetailItem): ArtworkMetadataEditValues {
  return {
    artist: item.artistName || '',
    title: item.artworkName || '',
    date: item.date || '',
    medium: item.medium || '',
  };
}

function getIdentifyAgainValues(item: ArtworkDetailItem): IdentifyAgainValues {
  return {
    artist: item.artistName || '',
    title: item.artworkName || '',
    additionalClue: '',
  };
}

export function useArtworkDetailEditor({
  item,
  onUpdateMetadata,
  onIdentifyAgain,
  editRequestToken,
}: UseArtworkDetailEditorOptions) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValues, setEditValues] = useState<ArtworkMetadataEditValues>(getEditValues(item));
  const [editTags, setEditTags] = useState<string[]>(item.keywords || []);
  const [tagInput, setTagInput] = useState('');
  const [isSavingField, setIsSavingField] = useState(false);
  const [showIdentifyAgainModal, setShowIdentifyAgainModal] = useState(false);
  const [identifyAgainError, setIdentifyAgainError] = useState<string | null>(null);
  const [isIdentifyingAgain, setIsIdentifyingAgain] = useState(false);
  const [identifyAgainValues, setIdentifyAgainValues] = useState<IdentifyAgainValues>(getIdentifyAgainValues(item));
  const [isFailureAlertDismissed, setIsFailureAlertDismissed] = useState(false);

  const originalValuesRef = useRef<ArtworkMetadataEditValues>(editValues);
  const originalTagsRef = useRef<string[]>(item.keywords || []);
  const firstEditInputRef = useRef<HTMLInputElement>(null);
  const lastHandledEditTokenRef = useRef<number>(0);

  useEffect(() => {
    setIsEditing(false);
    setTagInput('');
    const vals = getEditValues(item);
    const tags = item.keywords || [];
    setEditValues(vals);
    setEditTags(tags);
    originalValuesRef.current = vals;
    originalTagsRef.current = tags;
  }, [item.id]);

  useEffect(() => {
    setIdentifyAgainValues(getIdentifyAgainValues(item));
    setIdentifyAgainError(null);
    setShowIdentifyAgainModal(false);
    setIsIdentifyingAgain(false);
  }, [item.id, item.artistName, item.artworkName]);

  useEffect(() => {
    setIsFailureAlertDismissed(false);
  }, [item.id, item.analysisStatus, item.streamingText]);

  useEffect(() => {
    if (isEditing) return;
    const nextValues = getEditValues(item);
    setEditValues(nextValues);
    originalValuesRef.current = nextValues;
  }, [item.artistName, item.artworkName, item.date, item.medium, isEditing]);

  useEffect(() => {
    if (isEditing) return;
    const nextTags = item.keywords || [];
    setEditTags(nextTags);
    originalTagsRef.current = nextTags;
  }, [item.keywords, isEditing]);

  const startEditing = useCallback(() => {
    if (item.isAnalyzing || !item.artworkId) return;
    originalValuesRef.current = { ...editValues };
    originalTagsRef.current = [...editTags];
    setIsEditing(true);
  }, [editTags, editValues, item.artworkId, item.isAnalyzing]);

  const cancelEditing = useCallback(() => {
    setEditValues(originalValuesRef.current);
    setEditTags(originalTagsRef.current);
    setTagInput('');
    setIsEditing(false);
  }, []);

  useEffect(() => {
    if (!editRequestToken) return;
    if (editRequestToken === lastHandledEditTokenRef.current) return;
    lastHandledEditTokenRef.current = editRequestToken;
    startEditing();
  }, [editRequestToken, startEditing]);

  const saveAllFields = useCallback(async () => {
    if (!item.artworkId || isSavingField) return;

    const finalTags = tagInput.trim()
      ? [...editTags, tagInput.trim().startsWith('#') ? tagInput.trim() : `#${tagInput.trim()}`]
      : editTags;

    setTagInput('');
    setEditTags(finalTags);
    setIsEditing(false);

    const orig = originalValuesRef.current;
    const origTags = originalTagsRef.current;
    const apiUpdates: Record<string, string> = {};

    if (editValues.artist.trim() !== orig.artist) apiUpdates.artistName = editValues.artist.trim();
    if (editValues.title.trim() !== orig.title) apiUpdates.artworkName = editValues.title.trim();
    if (editValues.date.trim() !== orig.date) apiUpdates.date = editValues.date.trim();
    if (editValues.medium.trim() !== orig.medium) apiUpdates.medium = editValues.medium.trim();

    const tagsChanged = JSON.stringify(finalTags.slice().sort()) !== JSON.stringify(origTags.slice().sort());
    if (tagsChanged) apiUpdates.tags = finalTags.join(',');

    if (Object.keys(apiUpdates).length === 0) return;

    try {
      setIsSavingField(true);
      await updateArtwork(item.artworkId, apiUpdates);
      const metaUpdate: Partial<GalleryItem> & { keywords?: string[] } = { ...apiUpdates };
      if (tagsChanged) metaUpdate.keywords = finalTags;
      onUpdateMetadata?.(item.id, metaUpdate);
    } catch (error) {
      console.error('Failed to save metadata:', error);
    } finally {
      setIsSavingField(false);
    }
  }, [editTags, editValues, isSavingField, item.artworkId, item.id, onUpdateMetadata, tagInput]);

  const hasIdentifyAgainInput = Boolean(
    identifyAgainValues.artist.trim()
      || identifyAgainValues.title.trim()
      || identifyAgainValues.additionalClue.trim(),
  );

  const openIdentifyAgainModal = useCallback(() => {
    window.requestAnimationFrame(() => {
      setShowIdentifyAgainModal(true);
      setIdentifyAgainError(null);
    });
  }, []);

  const closeIdentifyAgainModal = useCallback(() => {
    if (!isIdentifyingAgain) {
      setShowIdentifyAgainModal(false);
      setIdentifyAgainError(null);
    }
  }, [isIdentifyingAgain]);

  const updateIdentifyAgainValues = useCallback((values: IdentifyAgainValues) => {
    setIdentifyAgainValues(values);
    if (identifyAgainError) setIdentifyAgainError(null);
  }, [identifyAgainError]);

  const submitIdentifyAgain = useCallback(async () => {
    if (!item.artworkId || !onIdentifyAgain || isIdentifyingAgain) return;
    if (!hasIdentifyAgainInput) {
      setIdentifyAgainError('Enter at least one clue to continue.');
      return;
    }

    try {
      setIsIdentifyingAgain(true);
      setIdentifyAgainError(null);
      setShowIdentifyAgainModal(false);
      await onIdentifyAgain({
        artistName: identifyAgainValues.artist.trim() || undefined,
        artworkName: identifyAgainValues.title.trim() || undefined,
        additionalClue: identifyAgainValues.additionalClue.trim() || undefined,
      });
    } catch (error) {
      console.error('Failed to identify artwork again:', error);
      setIdentifyAgainError('Could not identify the artwork again.');
    } finally {
      setIsIdentifyingAgain(false);
    }
  }, [hasIdentifyAgainInput, identifyAgainValues, isIdentifyingAgain, item.artworkId, onIdentifyAgain]);

  const handleEditKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void saveAllFields();
    }
    if (event.key === 'Escape') {
      cancelEditing();
    }
  }, [cancelEditing, saveAllFields]);

  return {
    isEditing,
    editValues,
    setEditValues,
    editTags,
    setEditTags,
    tagInput,
    setTagInput,
    isSavingField,
    showIdentifyAgainModal,
    identifyAgainError,
    isIdentifyingAgain,
    identifyAgainValues,
    updateIdentifyAgainValues,
    isFailureAlertDismissed,
    setIsFailureAlertDismissed,
    firstEditInputRef,
    startEditing,
    cancelEditing,
    saveAllFields,
    openIdentifyAgainModal,
    closeIdentifyAgainModal,
    submitIdentifyAgain,
    handleEditKeyDown,
  };
}
