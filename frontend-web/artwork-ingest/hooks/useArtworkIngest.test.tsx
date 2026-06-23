import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { useArtworkIngest } from './useArtworkIngest';
import type { GalleryItem, TagCoordinate, Visit } from '../../types';
import type { PendingSessionArtwork, VisitDraft, VisitStreamMessage } from '../../session/types';
import type { InterpretingItem } from '../../artwork/types';

const {
  mockAnalyzeArtworkFromExisting,
  mockSaveArtworkUpload,
  mockFetchAndPersistInsights,
  mockPrefetchExploreDataWithContext,
  mockHasUsableCommentaryContext,
  mockNormalizeUploadFile,
  mockReadExifMetadata,
  mockFormatPhotoTime,
  mockBuildUploadRequestKey,
  mockCreateLocationResolver,
} = vi.hoisted(() => ({
  mockAnalyzeArtworkFromExisting: vi.fn(),
  mockSaveArtworkUpload: vi.fn(),
  mockFetchAndPersistInsights: vi.fn(),
  mockPrefetchExploreDataWithContext: vi.fn(),
  mockHasUsableCommentaryContext: vi.fn(),
  mockNormalizeUploadFile: vi.fn(),
  mockReadExifMetadata: vi.fn(),
  mockFormatPhotoTime: vi.fn(),
  mockBuildUploadRequestKey: vi.fn(),
  mockCreateLocationResolver: vi.fn(),
}));

vi.mock('../../api/analysis', () => ({
  analyzeArtworkFromExisting: mockAnalyzeArtworkFromExisting,
  saveArtworkUpload: mockSaveArtworkUpload,
}));

vi.mock('../../api/artworks', () => ({
  fetchAndPersistInsights: mockFetchAndPersistInsights,
}));

vi.mock('../../api/explore', () => ({
  prefetchExploreDataWithContext: mockPrefetchExploreDataWithContext,
}));

vi.mock('../../session/lib/commentary', () => ({
  hasUsableCommentaryContext: mockHasUsableCommentaryContext,
}));

vi.mock('../lib/metadata', () => ({
  normalizeUploadFile: mockNormalizeUploadFile,
  readExifMetadata: mockReadExifMetadata,
  formatPhotoTime: mockFormatPhotoTime,
  buildUploadRequestKey: mockBuildUploadRequestKey,
}));

vi.mock('../lib/location', () => ({
  createLocationResolver: mockCreateLocationResolver,
}));

type HarnessOptions = {
  activeTab?: 'newSession' | 'collect' | 'profile' | 'learn';
  isComposingNewSession?: boolean;
  pendingSessionArtworks?: PendingSessionArtwork[];
  items?: GalleryItem[];
  visitStreams?: Record<string, VisitStreamMessage[]>;
};

function createFile(name = 'artwork.jpg', type = 'image/jpeg') {
  return new File(['file-data'], name, { type, lastModified: 1710000000000 });
}

function createAnalysis(overrides: Partial<Parameters<typeof mockAnalyzeArtworkFromExisting>[1]> = {}) {
  return {
    artist_name: 'Claude Monet',
    artwork_name: 'Water Lilies',
    description: 'A luminous study.',
    tags: ['#Impressionism'],
    date: '1906',
    medium: 'Oil on canvas',
    model_used: 'test-model',
    artwork_id: 'artwork-1',
    photo_uri: 'https://example.com/image.jpg',
    location: undefined,
    photo_time: 'Jun 1, 2026',
    session_title: undefined,
    reference_urls: [],
    artist_entity_id: 'artist-1',
    ...overrides,
  };
}

function createSavedUpload() {
  return {
    id: 'saved-1',
    photo_uri: 'https://example.com/image.jpg',
    artist_name: 'Unknown Artist',
    artwork_name: 'Untitled',
    location: null,
    photo_time: 'Jun 1, 2026',
    session_id: null,
    session_title: null,
    session_links: [],
    analysis_status: 'pending' as const,
    analysis_error: null,
    created_at: '2026-06-22T12:00:00Z',
  };
}

function renderUseArtworkIngest(options: HarnessOptions = {}) {
  const showToast = vi.fn();
  const resolveUploadSession = vi.fn(() => ({ visitId: 'visit-1', isNew: true }));
  const appendVisitMessages = vi.fn();
  const triggerUploadCommentary = vi.fn();
  const onExitSessionCapture = vi.fn();

  const hook = renderHook(() => {
    const [pendingSessionArtworks, setPendingSessionArtworks] = React.useState<PendingSessionArtwork[]>(
      options.pendingSessionArtworks ?? [],
    );
    const [items, setItems] = React.useState<GalleryItem[]>(options.items ?? []);
    const [visit, setVisit] = React.useState<Visit>({ id: 'initial', itemIds: [], globalConversation: [] });
    const [interpretingItem, setInterpretingItem] = React.useState<InterpretingItem | null>(null);
    const [tagPositions, setTagPositions] = React.useState<Record<string, TagCoordinate>>({});
    const [visitDrafts, setVisitDrafts] = React.useState<VisitDraft[]>([]);
    const [isAnalyzing, setIsAnalyzing] = React.useState(false);
    const [filteredVisitId, setFilteredVisitId] = React.useState<string | null>(null);

    const api = useArtworkIngest({
      userId: 'user-1',
      defaultVisitTitle: 'Untitled Session',
      activeTab: options.activeTab ?? 'collect',
      isComposingNewSession: options.isComposingNewSession ?? false,
      pendingSessionArtworks,
      items,
      visitStreams: options.visitStreams ?? {},
      setPendingSessionArtworks,
      setItems,
      setVisit,
      setInterpretingItem,
      setTagPositions,
      setVisitDrafts,
      setIsAnalyzing,
      setFilteredVisitId,
      showToast,
      parseAnalysis: (text) => text ?? '',
      resolveUploadSession,
      appendVisitMessages,
      triggerUploadCommentary,
      onExitSessionCapture,
    });

    return {
      api,
      state: {
        pendingSessionArtworks,
        items,
        visit,
        interpretingItem,
        tagPositions,
        visitDrafts,
        isAnalyzing,
        filteredVisitId,
      },
    };
  });

  return {
    ...hook,
    spies: {
      showToast,
      resolveUploadSession,
      appendVisitMessages,
      triggerUploadCommentary,
      onExitSessionCapture,
    },
  };
}

describe('useArtworkIngest', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockNormalizeUploadFile.mockImplementation(async (file: File) => file);
    mockReadExifMetadata.mockResolvedValue({
      latitude: 37.78,
      longitude: -122.4,
      timestamp: 1710000000000,
    });
    mockFormatPhotoTime.mockReturnValue('Mar 9, 2024');
    mockBuildUploadRequestKey.mockImplementation((files: File[], mode: string) => `${mode}:${files.map((file) => file.name).join('|')}`);
    mockCreateLocationResolver.mockReturnValue(vi.fn().mockResolvedValue({
      city: 'San Francisco',
      country: 'United States',
      museum: 'SFMOMA',
    }));
    mockFetchAndPersistInsights.mockResolvedValue([]);
    mockHasUsableCommentaryContext.mockReturnValue(true);
    mockPrefetchExploreDataWithContext.mockReturnValue(undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('stages uploads for a new composed session instead of persisting immediately', async () => {
    const { result, spies } = renderUseArtworkIngest({
      activeTab: 'newSession',
      isComposingNewSession: true,
      pendingSessionArtworks: [],
    });

    await act(async () => {
      await result.current.api.processArtworkFiles([createFile('first.jpg')], 'gallery');
    });

    expect(result.current.state.pendingSessionArtworks).toHaveLength(1);
    expect(result.current.state.pendingSessionArtworks[0]).toMatchObject({
      kind: 'upload',
      mode: 'gallery',
      label: 'first',
      sublabel: 'Mar 9, 2024',
    });
    expect(mockSaveArtworkUpload).not.toHaveBeenCalled();
    expect(mockAnalyzeArtworkFromExisting).not.toHaveBeenCalled();
    expect(spies.showToast).not.toHaveBeenCalled();
  });

  it('persists and analyzes a single collection upload successfully', async () => {
    mockSaveArtworkUpload.mockResolvedValue(createSavedUpload());
    mockAnalyzeArtworkFromExisting.mockResolvedValue(createAnalysis());

    const { result, spies } = renderUseArtworkIngest({
      activeTab: 'collect',
      isComposingNewSession: false,
      items: [],
    });

    const file = createFile('monet.jpg');
    const resetInput = vi.fn();

    await act(async () => {
      await result.current.api.processArtworkFiles([file], 'gallery', resetInput);
    });

    await waitFor(() => {
      expect(result.current.state.items).toHaveLength(1);
      expect(result.current.state.items[0].analysisStatus).toBe('analyzed');
    });

    expect(mockSaveArtworkUpload).toHaveBeenCalledWith(
      file,
      'user-1',
      undefined,
      expect.any(String),
      'Mar 9, 2024',
      37.78,
      -122.4,
      'upload',
      0,
    );
    expect(mockAnalyzeArtworkFromExisting).toHaveBeenCalledWith('saved-1', {
      labelFile: null,
    });
    expect(result.current.state.items[0]).toMatchObject({
      id: 'saved-1',
      artistName: 'Claude Monet',
      artworkName: 'Water Lilies',
      analysisStatus: 'analyzed',
      syncStatus: 'synced',
    });
    expect(spies.showToast).toHaveBeenCalledWith('Added an artwork to collection', 'success');
    expect(resetInput).toHaveBeenCalled();
  });

  it('keeps a persisted upload and marks it failed when analysis rejects', async () => {
    mockSaveArtworkUpload.mockResolvedValue(createSavedUpload());
    mockAnalyzeArtworkFromExisting.mockRejectedValue(new Error('Analysis failed hard'));

    const { result, spies } = renderUseArtworkIngest({
      activeTab: 'collect',
      isComposingNewSession: false,
      items: [],
    });

    await act(async () => {
      await result.current.api.processArtworkFiles([createFile('broken.jpg')], 'gallery');
    });

    await waitFor(() => {
      expect(result.current.state.items).toHaveLength(1);
      expect(result.current.state.items[0].analysisStatus).toBe('failed');
    });

    expect(result.current.state.items[0]).toMatchObject({
      id: 'saved-1',
      analysisStatus: 'failed',
      analysisError: 'Analysis failed hard',
      syncStatus: 'synced',
    });
    expect(spies.showToast).toHaveBeenCalledWith('Added an artwork to collection', 'success');
  });

  it('normalizes capture files, exits capture, and forwards label + coords into analysis', async () => {
    mockSaveArtworkUpload.mockResolvedValue(createSavedUpload());
    mockAnalyzeArtworkFromExisting.mockResolvedValue(createAnalysis());

    const { result, spies } = renderUseArtworkIngest({
      activeTab: 'collect',
      isComposingNewSession: false,
    });

    const artwork = createFile('artwork.jpg');
    const label = createFile('label.jpg');

    await act(async () => {
      await result.current.api.handleSessionCaptureSubmit({
        artwork,
        label,
        coords: { latitude: 40.7, longitude: -74.0 },
      });
    });

    expect(spies.onExitSessionCapture).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(mockAnalyzeArtworkFromExisting).toHaveBeenCalled();
    });

    expect(mockSaveArtworkUpload).toHaveBeenCalledWith(
      artwork,
      'user-1',
      undefined,
      expect.any(String),
      'Mar 9, 2024',
      40.7,
      -74,
      'camera',
      0,
    );
    expect(mockAnalyzeArtworkFromExisting).toHaveBeenCalledWith('saved-1', {
      labelFile: label,
    });
  });
});
