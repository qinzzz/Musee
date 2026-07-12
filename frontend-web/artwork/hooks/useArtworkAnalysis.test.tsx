import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useArtworkAnalysis } from './useArtworkAnalysis';
import type { GalleryItem } from '../../types';
import type { ArtworkDetailItem } from '../types';

const {
  mockAnalyzeArtworkFromExisting,
  mockGetArtworkFunFacts,
} = vi.hoisted(() => ({
  mockAnalyzeArtworkFromExisting: vi.fn(),
  mockGetArtworkFunFacts: vi.fn(),
}));

vi.mock('../../api/analysis', () => ({
  analyzeArtworkFromExisting: mockAnalyzeArtworkFromExisting,
}));

vi.mock('../../api/artworks', () => ({
  getArtworkFunFacts: mockGetArtworkFunFacts,
}));

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createAnalysis(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    artist_name: 'Claude Monet',
    artwork_name: 'Water Lilies',
    description: 'A luminous study.',
    tags: ['#impressionism'],
    date: '1906',
    medium: 'Oil on canvas',
    model_used: 'test-model',
    artwork_id: 'artwork-1',
    photo_uri: 'https://example.com/art.jpg',
    location: undefined,
    photo_time: 'Jun 1, 2026',
    reference_urls: [],
    artist_entity_id: 'artist-1',
    ...overrides,
  };
}

function createItem(overrides: Partial<GalleryItem> = {}): ArtworkDetailItem {
  return {
    id: 'item-1',
    artworkId: 'artwork-1',
    url: 'https://example.com/art.jpg',
    keywords: [],
    vibe: {
      backgroundColor: '#fff',
      padding: 4,
      borderRadius: '12px',
      borderType: 'solid',
      accentColor: '#000',
    },
    timestamp: Date.now(),
    conversation: [],
    artistName: 'Unknown Artist',
    artworkName: 'Untitled',
    sessionLinks: [{ sessionId: 'visit-1' }],
    ...overrides,
  };
}

function renderUseArtworkAnalysis(artworkDetailItem: ArtworkDetailItem | null = createItem()) {
  const updateSavedArtworkInState = vi.fn();
  const applyArtworkAnalysisResult = vi.fn();
  const markArtworkAnalysisFailed = vi.fn();

  const hook = renderHook(
    ({ item }) => useArtworkAnalysis({
      artworkDetailItem: item,
      updateSavedArtworkInState,
      applyArtworkAnalysisResult,
      markArtworkAnalysisFailed,
    }),
    {
      initialProps: { item: artworkDetailItem },
    },
  );

  return {
    ...hook,
    spies: {
      updateSavedArtworkInState,
      applyArtworkAnalysisResult,
      markArtworkAnalysisFailed,
    },
  };
}

describe('useArtworkAnalysis', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockGetArtworkFunFacts.mockResolvedValue([]);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.clearAllMocks();
  });

  it('retries analysis successfully and hydrates fun facts for known artists', async () => {
    mockAnalyzeArtworkFromExisting.mockResolvedValue(createAnalysis());
    mockGetArtworkFunFacts.mockResolvedValue([{ title: 'Fact', text: 'Body' }]);

    const item = createItem();
    const { result, spies } = renderUseArtworkAnalysis(item);

    await act(async () => {
      await result.current.handleRetryAnalysis(item);
    });

    expect(spies.updateSavedArtworkInState).toHaveBeenCalledWith(item.id, {
      clientState: expect.objectContaining({
        isAnalyzing: true,
        analysisStatus: 'analyzing',
      }),
    });
    expect(spies.applyArtworkAnalysisResult).toHaveBeenCalledWith(item.id, expect.objectContaining({
      artist_name: 'Claude Monet',
      artwork_id: 'artwork-1',
    }), {
      sessionLinks: item.sessionLinks,
    });
    await waitFor(() => {
      expect(spies.updateSavedArtworkInState).toHaveBeenCalledWith(item.id, {
        record: { insights: [{ title: 'Fact', text: 'Body' }] },
      });
    });
  });

  it('marks retry analysis as failed when the request errors', async () => {
    mockAnalyzeArtworkFromExisting.mockRejectedValue(new Error('boom'));

    const item = createItem();
    const { result, spies } = renderUseArtworkAnalysis(item);

    await act(async () => {
      await result.current.handleRetryAnalysis(item);
    });

    expect(spies.markArtworkAnalysisFailed).toHaveBeenCalledWith(item.id, 'Retry failed.');
  });

  it('reidentifies with hints and rethrows on failure', async () => {
    const failure = new Error('bad request');
    mockAnalyzeArtworkFromExisting.mockRejectedValue(failure);

    const item = createItem({ artistName: 'Unknown Artist', artworkName: 'Untitled' });
    const { result, spies } = renderUseArtworkAnalysis(item);

    await expect(result.current.handleIdentifyAgain({
      artistName: 'Monet',
      artworkName: 'Water Lilies',
      additionalClue: 'Blue pond scene',
    })).rejects.toThrow('bad request');

    expect(spies.updateSavedArtworkInState).toHaveBeenCalledWith(item.id, {
      clientState: expect.objectContaining({
        isAnalyzing: true,
        analysisStatus: 'reidentifying',
      }),
    });
    expect(mockAnalyzeArtworkFromExisting).toHaveBeenCalledWith('artwork-1', {
      artistName: 'Monet',
      artworkName: 'Water Lilies',
      additionalClue: 'Blue pond scene',
    });
    expect(spies.markArtworkAnalysisFailed).toHaveBeenCalledWith(item.id, 'Identify again failed.');
  });

  it('handles header identify-again modal lifecycle', async () => {
    const deferred = createDeferred<ReturnType<typeof createAnalysis>>();
    mockAnalyzeArtworkFromExisting.mockReturnValue(deferred.promise);

    const item = createItem({ artistName: 'Claude Monet', artworkName: 'Water Lilies' });
    const { result, rerender } = renderUseArtworkAnalysis(item);

    act(() => {
      result.current.openHeaderIdentifyAgainModal();
    });

    expect(result.current.showHeaderIdentifyAgainModal).toBe(true);
    expect(result.current.headerIdentifyAgainValues).toEqual({
      artist: 'Claude Monet',
      title: 'Water Lilies',
      additionalClue: '',
    });

    act(() => {
      result.current.updateHeaderIdentifyAgainValues({
        artist: '',
        title: '',
        additionalClue: '',
      });
    });

    await act(async () => {
      await result.current.submitHeaderIdentifyAgain();
    });

    expect(result.current.headerIdentifyAgainError).toBe('Enter at least one clue to continue.');

    act(() => {
      result.current.updateHeaderIdentifyAgainValues({
        artist: '',
        title: '',
        additionalClue: 'Seen at MoMA',
      });
    });

    act(() => {
      void result.current.submitHeaderIdentifyAgain();
    });

    expect(result.current.showHeaderIdentifyAgainModal).toBe(false);
    expect(result.current.isHeaderIdentifyingAgain).toBe(true);

    deferred.resolve(createAnalysis());
    await waitFor(() => {
      expect(result.current.isHeaderIdentifyingAgain).toBe(false);
    });

    rerender({ item: null });
    await waitFor(() => {
      expect(result.current.showHeaderIdentifyAgainModal).toBe(false);
      expect(result.current.headerIdentifyAgainError).toBeNull();
    });
  });
});
