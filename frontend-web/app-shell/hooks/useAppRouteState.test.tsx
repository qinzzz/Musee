import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAppRouteState } from './useAppRouteState';

describe('useAppRouteState', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes collection and artist context from the URL', () => {
    const { result } = renderHook(() => useAppRouteState({
      pathname: '/artists/artist-1',
      canSearchCollection: true,
      canViewProfile: true,
    }));

    expect(result.current.activeTab).toBe('collect');
    expect(result.current.collectTab).toBe('artists');
    expect(result.current.artistPageContext).toEqual({
      artistEntityId: 'artist-1',
      parentLabel: 'Artists',
    });
  });

  it('starts on the session route when the requested route is restricted', () => {
    const { result } = renderHook(() => useAppRouteState({
      pathname: '/profile',
      canSearchCollection: false,
      canViewProfile: false,
    }));

    expect(result.current.activeTab).toBe('newSession');
    expect(result.current.artistPageContext).toBeNull();
    expect(result.current.canAccessTab('profile')).toBe(false);
    expect(result.current.canAccessTab('collect')).toBe(false);
    expect(result.current.canAccessTab('newSession')).toBe(true);
  });

  it('keeps the initial learning guide stable after route changes', () => {
    const { result } = renderHook(() => useAppRouteState({
      pathname: '/learning/impressionism',
      canSearchCollection: true,
      canViewProfile: true,
    }));

    act(() => result.current.setActiveTab('collect'));

    expect(result.current.learningInitialGuide).toBe('impressionism');
  });

  it('clears detail contexts and replaces history when access is revoked', async () => {
    const replaceState = vi.spyOn(window.history, 'replaceState');
    const { result, rerender } = renderHook(
      ({ canSearchCollection }) => useAppRouteState({
        pathname: '/saved',
        canSearchCollection,
        canViewProfile: true,
      }),
      { initialProps: { canSearchCollection: true } },
    );

    act(() => {
      result.current.setArtistPageContext({ artistEntityId: 'artist-1' });
      result.current.setMovementPageContext({
        id: 'movement-1',
        type: 'movement',
        name: 'Movement',
        rarity: 'common',
        description: '',
        artwork_count: 0,
        artwork_ids: [],
        cover_uris: [],
        hook: '',
      });
      result.current.setArtworkDetailContext({ parentLabel: 'Saved', basePath: '/saved' });
    });

    rerender({ canSearchCollection: false });

    await waitFor(() => expect(result.current.activeTab).toBe('newSession'));
    expect(result.current.artistPageContext).toBeNull();
    expect(result.current.movementPageContext).toBeNull();
    expect(result.current.artworkDetailContext).toBeNull();
    expect(replaceState).toHaveBeenCalledWith(
      { view: 'root', activeTab: 'newSession', collectTab: 'saved' },
      '',
      '/',
    );
  });
});
