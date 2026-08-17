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
    const onCloseSessionMenu = vi.fn();

    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 1280,
    });

    const { result } = renderHook(() => useAppShellNavigation({
      activeTab: 'collect',
      isComposingNewSession: false,
      editingSessionId: null,
      clearShellOverlays,
      onSetActiveTab,
      onEnterBlankSession,
      onOpenSessionSummary,
      onCloseSessionMenu,
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
    const onCloseSessionMenu = vi.fn();

    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 390,
    });

    const { result } = renderHook(() => useAppShellNavigation({
      activeTab: 'newSession',
      isComposingNewSession: true,
      editingSessionId: null,
      clearShellOverlays,
      onSetActiveTab,
      onEnterBlankSession,
      onOpenSessionSummary,
      onCloseSessionMenu,
    }));

    act(() => {
      result.current.handleSelectSessionSummary('session-1');
    });

    expect(onOpenSessionSummary).toHaveBeenCalledWith('session-1');
    expect(onCloseSessionMenu).toHaveBeenCalledTimes(1);
    expect(clearShellOverlays).toHaveBeenCalledTimes(1);
    expect(result.current.sidebarOpen).toBe(false);
  });

  it('closes floating shell menus when opening the mobile sidebar', () => {
    const onCloseSessionMenu = vi.fn();

    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 390,
    });

    const { result } = renderHook(() => useAppShellNavigation({
      activeTab: 'collect',
      isComposingNewSession: false,
      editingSessionId: null,
      clearShellOverlays: vi.fn(),
      onSetActiveTab: vi.fn(),
      onEnterBlankSession: vi.fn(),
      onOpenSessionSummary: vi.fn(),
      onCloseSessionMenu,
    }));

    act(() => {
      result.current.setRecentsOpen(true);
      result.current.setUserMenuOpen(true);
      result.current.openSidebar();
    });

    expect(onCloseSessionMenu).toHaveBeenCalledTimes(1);
    expect(result.current.recentsOpen).toBe(false);
    expect(result.current.userMenuOpen).toBe(false);
    expect(result.current.sidebarOpen).toBe(true);
  });

  it('closes floating shell menus when closing the mobile sidebar', () => {
    const onCloseSessionMenu = vi.fn();

    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 390,
    });

    const { result } = renderHook(() => useAppShellNavigation({
      activeTab: 'collect',
      isComposingNewSession: false,
      editingSessionId: null,
      clearShellOverlays: vi.fn(),
      onSetActiveTab: vi.fn(),
      onEnterBlankSession: vi.fn(),
      onOpenSessionSummary: vi.fn(),
      onCloseSessionMenu,
    }));

    act(() => {
      result.current.setRecentsOpen(true);
      result.current.setUserMenuOpen(true);
      result.current.closeMobileSidebar();
    });

    expect(onCloseSessionMenu).toHaveBeenCalledTimes(1);
    expect(result.current.recentsOpen).toBe(false);
    expect(result.current.userMenuOpen).toBe(false);
    expect(result.current.sidebarOpen).toBe(false);
  });

  it('marks the new session entry active only while composing a fresh session', () => {
    const { result } = renderHook(() => useAppShellNavigation({
      activeTab: 'newSession',
      isComposingNewSession: true,
      editingSessionId: null,
      clearShellOverlays: vi.fn(),
      onSetActiveTab: vi.fn(),
      onEnterBlankSession: vi.fn(),
      onOpenSessionSummary: vi.fn(),
      onCloseSessionMenu: vi.fn(),
    }));

    expect(result.current.isNewSessionEntryActive).toBe(true);
    expect(result.current.navigationItems.find((item) => item.id === 'newSession')?.isActive).toBe(true);
  });

  it('opens authentication instead of navigating to a restricted collection', () => {
    const onSetActiveTab = vi.fn();
    const onRestrictedTab = vi.fn();
    const { result } = renderHook(() => useAppShellNavigation({
      activeTab: 'newSession',
      isComposingNewSession: true,
      editingSessionId: null,
      clearShellOverlays: vi.fn(),
      onSetActiveTab,
      onEnterBlankSession: vi.fn(),
      onOpenSessionSummary: vi.fn(),
      onCloseSessionMenu: vi.fn(),
      canAccessTab: (tab) => tab !== 'collect',
      onRestrictedTab,
    }));

    act(() => {
      result.current.navigationItems.find((item) => item.id === 'collect')?.onSelect();
    });

    expect(onRestrictedTab).toHaveBeenCalledWith('collect');
    expect(onSetActiveTab).not.toHaveBeenCalled();
  });
});
