import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAppShellNavigation } from './useAppShellNavigation';

describe('useAppShellNavigation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resets into a blank session when switching to the new session tab', () => {
    const clearShellOverlays = vi.fn();
    const onSetActiveTab = vi.fn();
    const onEnterBlankSession = vi.fn();
    const onOpenSessionSummary = vi.fn();
    const onCloseVisitMenu = vi.fn();

    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 1280,
    });

    const { result } = renderHook(() => useAppShellNavigation({
      activeTab: 'collect',
      isComposingNewSession: false,
      editingVisitId: null,
      clearShellOverlays,
      onSetActiveTab,
      onEnterBlankSession,
      onOpenSessionSummary,
      onCloseVisitMenu,
    }));

    act(() => {
      const newSessionItem = result.current.navigationItems.find((item) => item.id === 'newSession');
      newSessionItem?.onSelect();
    });

    expect(onSetActiveTab).toHaveBeenCalledWith('newSession');
    expect(onEnterBlankSession).toHaveBeenCalledTimes(1);
    expect(clearShellOverlays).toHaveBeenCalledTimes(1);
  });

  it('opens an existing session and closes shell menus on mobile', () => {
    const clearShellOverlays = vi.fn();
    const onSetActiveTab = vi.fn();
    const onEnterBlankSession = vi.fn();
    const onOpenSessionSummary = vi.fn();
    const onCloseVisitMenu = vi.fn();

    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 390,
    });

    const { result } = renderHook(() => useAppShellNavigation({
      activeTab: 'newSession',
      isComposingNewSession: true,
      editingVisitId: null,
      clearShellOverlays,
      onSetActiveTab,
      onEnterBlankSession,
      onOpenSessionSummary,
      onCloseVisitMenu,
    }));

    act(() => {
      result.current.handleSelectVisitSummary('session-1');
    });

    expect(onOpenSessionSummary).toHaveBeenCalledWith('session-1');
    expect(onCloseVisitMenu).toHaveBeenCalledTimes(1);
    expect(clearShellOverlays).toHaveBeenCalledTimes(1);
    expect(result.current.sidebarOpen).toBe(false);
  });

  it('marks the new session entry active only while composing a fresh session', () => {
    const { result } = renderHook(() => useAppShellNavigation({
      activeTab: 'newSession',
      isComposingNewSession: true,
      editingVisitId: null,
      clearShellOverlays: vi.fn(),
      onSetActiveTab: vi.fn(),
      onEnterBlankSession: vi.fn(),
      onOpenSessionSummary: vi.fn(),
      onCloseVisitMenu: vi.fn(),
    }));

    expect(result.current.isNewSessionEntryActive).toBe(true);
    expect(result.current.navigationItems.find((item) => item.id === 'newSession')?.isActive).toBe(true);
  });
});
