import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { useArtworkUploadOperations } from './useArtworkUploadOperations';
import { updateArtworkInList } from '../../artwork/lib/artworkState';
import type { GalleryItem, TagCoordinate } from '../../types';
import type { PendingSessionArtwork } from '../../session/types';

const {
  mockAnalyzeArtworkFromExisting,
  mockSaveArtworkUpload,
  mockGetArtworkFunFacts,
  mockNormalizeUploadFile,
  mockReadExifMetadata,
  mockFormatPhotoTime,
  mockBuildUploadRequestKey,
  mockCreateLocationResolver,
} = vi.hoisted(() => ({
  mockAnalyzeArtworkFromExisting: vi.fn(),
  mockSaveArtworkUpload: vi.fn(),
  mockGetArtworkFunFacts: vi.fn(),
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
  getArtworkFunFacts: mockGetArtworkFunFacts,
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
  canStageSessionArtworks?: boolean;
  pendingSessionArtworks?: PendingSessionArtwork[];
  items?: GalleryItem[];
};

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createFile(name = 'artwork.jpg', type = 'image/jpeg') {
  return new File(['file-data'], name, { type, lastModified: 1710000000000 });
}

function createSizedFile(name: string, size: number, type = 'image/jpeg') {
  const file = createFile(name, type);
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

function createGalleryItem(overrides: Partial<GalleryItem> = {}): GalleryItem {
  return {
    id: 'existing-1',
    artworkId: 'existing-artwork-1',
    url: 'https://example.com/existing.jpg',
    keywords: [],
    vibe: {
      backgroundColor: '#fff',
      padding: 4,
      borderRadius: '12px',
      borderType: 'solid',
      accentColor: '#000',
    },
    timestamp: 100,
    sessionCapturedAt: 100,
    conversation: [],
    artistName: 'Artist',
    artworkName: 'Existing Work',
    syncStatus: 'synced',
    ...overrides,
  };
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
    session_links: [],
    analysis_status: 'pending' as const,
    analysis_error: null,
    created_at: '2026-06-22T12:00:00Z',
  };
}

function renderUseArtworkUploadOperations(options: HarnessOptions = {}) {
  const showToast = vi.fn();

  const hook = renderHook(() => {
    const [pendingSessionArtworks, setPendingSessionArtworks] = React.useState<PendingSessionArtwork[]>(
      options.pendingSessionArtworks ?? [],
    );
    const [items, setItems] = React.useState<GalleryItem[]>(options.items ?? []);
    const [artworkDetailSelection, setArtworkDetailSelection] = React.useState<{
      artworkClientId: string;
      navigationItemClientIds?: string[];
    } | null>(null);
    const [tagPositions, setTagPositions] = React.useState<Record<string, TagCoordinate>>({});
    const [isAnalyzing, setIsAnalyzing] = React.useState(false);

    const api = useArtworkUploadOperations({
      userId: 'user-1',
      activeTab: options.activeTab ?? 'collect',
      canStageSessionArtworks: options.canStageSessionArtworks ?? false,
      pendingSessionArtworks,
      setPendingSessionArtworks,
      patchArtwork: (targetId, patch) => setItems((prev) => updateArtworkInList(prev, targetId, patch)),
      addLocalArtworks: (newItems) => setItems((prev) => [...newItems, ...prev]),
      replaceArtwork: (targetId, next) => setItems((prev) => prev.map((item) => (item.id === targetId ? next : item))),
      removeArtwork: (targetId) => setItems((prev) => prev.filter((item) => item.id !== targetId)),
      artworkDetailSelection,
      setArtworkDetailSelection,
      setTagPositions,
      setIsAnalyzing,
      showToast,
      parseAnalysis: (text) => text ?? '',
    });

    return {
      api,
      state: {
        pendingSessionArtworks,
        items,
        artworkDetailSelection,
        tagPositions,
        isAnalyzing,
      },
      actions: {
        setArtworkDetailSelection,
      },
    };
  });

  return {
    ...hook,
    spies: {
      showToast,
    },
  };
}

describe('useArtworkUploadOperations', () => {
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
    mockGetArtworkFunFacts.mockResolvedValue([]);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('stages uploads for a new composed session instead of persisting immediately', async () => {
    const { result, spies } = renderUseArtworkUploadOperations({
      activeTab: 'newSession',
      canStageSessionArtworks: true,
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

    const { result, spies } = renderUseArtworkUploadOperations({
      activeTab: 'collect',
      canStageSessionArtworks: false,
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
      undefined,
    );
    expect(mockAnalyzeArtworkFromExisting).toHaveBeenCalledWith('saved-1', {
      labelFile: null,
    });
    expect(result.current.state.items[0].id).toMatch(/^upload-placeholder-/);
    expect(result.current.state.items[0]).toMatchObject({
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

    const { result, spies } = renderUseArtworkUploadOperations({
      activeTab: 'collect',
      canStageSessionArtworks: false,
      items: [],
    });

    await act(async () => {
      await result.current.api.processArtworkFiles([createFile('broken.jpg')], 'gallery');
    });

    await waitFor(() => {
      expect(result.current.state.items).toHaveLength(1);
      expect(result.current.state.items[0].analysisStatus).toBe('failed');
    });

    expect(result.current.state.items[0].id).toMatch(/^upload-placeholder-/);
    expect(result.current.state.items[0]).toMatchObject({
      analysisStatus: 'failed',
      analysisError: 'Artwork saved, but Musee couldn’t analyze it. Try identifying it again.',
      syncStatus: 'synced',
    });
    expect(spies.showToast).toHaveBeenCalledWith('Added an artwork to collection', 'success');
    expect(spies.showToast).toHaveBeenCalledWith(
      'Artwork saved, but Musee couldn’t analyze it. Try identifying it again.',
      'info',
    );
  });

  it('rejects oversized images before staging while preserving valid files', async () => {
    const { result, spies } = renderUseArtworkUploadOperations({
      activeTab: 'newSession',
      canStageSessionArtworks: true,
      pendingSessionArtworks: [],
    });
    const oversized = createSizedFile('large.jpg', 17 * 1024 * 1024);
    const valid = createFile('valid.jpg');

    await act(async () => {
      await result.current.api.processArtworkFiles([oversized, valid], 'gallery');
    });

    expect(result.current.state.pendingSessionArtworks).toHaveLength(1);
    expect(result.current.state.pendingSessionArtworks[0]).toMatchObject({ label: 'valid' });
    expect(spies.showToast).toHaveBeenCalledWith(
      '“large.jpg” is 17 MB. Choose an image that is 10 MB or smaller.',
      'info',
    );
    expect(mockSaveArtworkUpload).not.toHaveBeenCalled();
  });

  it('keeps valid files when another image cannot be prepared', async () => {
    const broken = createFile('broken.heic', 'image/heic');
    const valid = createFile('valid.jpg');
    mockNormalizeUploadFile.mockImplementation(async (file: File) => {
      if (file === broken) throw new Error('conversion failed');
      return file;
    });
    const { result, spies } = renderUseArtworkUploadOperations({
      activeTab: 'newSession',
      canStageSessionArtworks: true,
    });

    await act(async () => {
      await result.current.api.processArtworkFiles([broken, valid], 'gallery');
    });

    expect(result.current.state.pendingSessionArtworks).toHaveLength(1);
    expect(spies.showToast).toHaveBeenCalledWith(
      'Musee couldn’t prepare “broken.heic”. Try a JPG or PNG version instead.',
      'info',
    );
  });

  it('removes a failed collection placeholder and explains the upload failure', async () => {
    mockSaveArtworkUpload.mockRejectedValue(new Error('network disconnected'));
    const { result, spies } = renderUseArtworkUploadOperations({
      activeTab: 'collect',
      items: [],
    });

    await act(async () => {
      await result.current.api.processArtworkFiles([createFile('failed.jpg')], 'gallery');
    });

    expect(result.current.state.items).toHaveLength(0);
    expect(spies.showToast).toHaveBeenCalledWith(
      'Musee couldn’t upload this artwork. Check your connection and try again.',
      'info',
    );
  });

  it('normalizes capture files into a prepared pipeline entry with label and coordinates', async () => {
    const { result } = renderUseArtworkUploadOperations({
      activeTab: 'collect',
      canStageSessionArtworks: false,
    });

    const artwork = createFile('artwork.jpg');
    const label = createFile('label.jpg');

    let prepared!: PendingSessionArtwork;
    await act(async () => {
      prepared = await result.current.api.prepareCaptureSubmission({
        artwork,
        label,
        coords: { latitude: 40.7, longitude: -74.0 },
      });
    });

    expect(prepared).toMatchObject({
      kind: 'upload',
      file: artwork,
      labelFile: label,
      mode: 'camera',
      coords: { latitude: 40.7, longitude: -74 },
    });
  });

  it('rejects an oversized capture with a clear size message', async () => {
    const { result, spies } = renderUseArtworkUploadOperations();
    const artwork = createSizedFile('capture.jpg', 17 * 1024 * 1024);

    let prepared: PendingSessionArtwork | null = null;
    await act(async () => {
      prepared = await result.current.api.prepareCaptureSubmission({ artwork, label: null });
    });

    expect(prepared).toBeNull();
    expect(spies.showToast).toHaveBeenCalledWith(
      '“capture.jpg” is 17 MB. Choose an image that is 10 MB or smaller.',
      'info',
    );
  });

  it('keeps the open artwork detail selection on the stable client id after persistence', async () => {
    const deferredAnalysis = createDeferred<ReturnType<typeof createAnalysis>>();
    mockSaveArtworkUpload.mockResolvedValue(createSavedUpload());
    mockAnalyzeArtworkFromExisting.mockReturnValue(deferredAnalysis.promise);

    const { result } = renderUseArtworkUploadOperations({
      activeTab: 'collect',
      canStageSessionArtworks: false,
      items: [],
    });

    let uploadPromise!: Promise<void>;
    act(() => {
      uploadPromise = result.current.api.processArtworkFiles([createFile('selection.jpg')], 'gallery');
    });

    await waitFor(() => {
      expect(result.current.state.items).toHaveLength(1);
      expect(result.current.state.items[0].analysisStatus).toBe('pending');
    });

    const placeholderId = result.current.state.items[0].id;

    act(() => {
      result.current.actions.setArtworkDetailSelection({
        artworkClientId: placeholderId,
        navigationItemClientIds: [placeholderId],
      });
    });

    deferredAnalysis.resolve(createAnalysis());
    await act(async () => {
      await uploadPromise;
    });

    await waitFor(() => {
      expect(result.current.state.artworkDetailSelection).toEqual({
        artworkClientId: placeholderId,
        navigationItemClientIds: [placeholderId],
      });
      expect(result.current.state.items[0].id).toBe(placeholderId);
      expect(result.current.state.items[0].artworkId).toBe('artwork-1');
      expect(result.current.state.items[0].analysisStatus).toBe('analyzed');
    });
  });

  it('keeps stable client ids for batch uploads while assigning persisted artwork ids separately', async () => {
    mockSaveArtworkUpload
      .mockResolvedValueOnce({
        ...createSavedUpload(),
        id: 'saved-1',
        session_links: [{ session_id: 'visit-1', sequence_number: 0, source: 'upload' }],
      })
      .mockResolvedValueOnce({
        ...createSavedUpload(),
        id: 'saved-2',
        session_links: [{ session_id: 'visit-1', sequence_number: 1, source: 'upload' }],
      });
    mockAnalyzeArtworkFromExisting
      .mockResolvedValueOnce(createAnalysis({ artwork_id: 'saved-1' }))
      .mockResolvedValueOnce(createAnalysis({ artwork_id: 'saved-2' }));

    const { result } = renderUseArtworkUploadOperations({
      activeTab: 'collect',
      canStageSessionArtworks: false,
      items: [],
    });

    await act(async () => {
      await result.current.api.processArtworkFiles([
        createFile('batch-one.jpg'),
        createFile('batch-two.jpg'),
      ], 'gallery');
    });

    const ids = result.current.state.items.map((item) => item.id);
    expect(ids).toHaveLength(2);
    expect(ids.every((id) => id.startsWith('upload-placeholder-'))).toBe(true);
    expect(result.current.state.items.map((item) => item.artworkId)).toEqual(['saved-1', 'saved-2']);
  });

  it('preserves successful batch uploads and reports failed files clearly', async () => {
    mockSaveArtworkUpload
      .mockResolvedValueOnce(createSavedUpload())
      .mockRejectedValueOnce(new Error('network disconnected'));
    mockAnalyzeArtworkFromExisting.mockResolvedValue(createAnalysis());
    const { result, spies } = renderUseArtworkUploadOperations({
      activeTab: 'collect',
      items: [],
    });

    await act(async () => {
      await result.current.api.processArtworkFiles([
        createFile('saved.jpg'),
        createFile('failed.jpg'),
      ], 'gallery');
    });

    expect(result.current.state.items).toHaveLength(1);
    expect(result.current.state.items[0].analysisStatus).toBe('analyzed');
    expect(spies.showToast).toHaveBeenCalledWith(
      'Musee couldn’t upload this artwork. Check your connection and try again. The other selected artworks were added.',
      'info',
    );
  });
});
