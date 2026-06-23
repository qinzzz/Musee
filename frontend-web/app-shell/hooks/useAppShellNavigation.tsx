import React, { useEffect, useMemo, useState } from 'react';
import type { AppTab } from '../../lib/appNavigation';

type NavigationItem = {
  id: AppTab;
  label: string;
  icon: React.ReactNode;
  isActive: boolean;
  onSelect: () => void;
};

type UseAppShellNavigationOptions = {
  activeTab: AppTab;
  isComposingNewSession: boolean;
  editingVisitId: string | null;
  clearShellOverlays: () => void;
  onSetActiveTab: (tab: AppTab) => void;
  onEnterBlankSession: () => void;
  onOpenSessionSummary: (summaryId: string) => void;
  onCloseVisitMenu: () => void;
};

const SHOW_LEARN_TAB = false;

const topLevelNavigationBase: Array<{ id: AppTab; label: string; icon: React.ReactNode }> = [
  {
    id: 'newSession',
    label: 'New Session',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    ),
  },
  {
    id: 'collect',
    label: 'Collection',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2 2H2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    id: 'profile',
    label: 'Profile',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="4" />
        <path d="M20 21a8 8 0 0 0-16 0" />
      </svg>
    ),
  },
];

if (SHOW_LEARN_TAB) {
  topLevelNavigationBase.push({
    id: 'learn',
    label: 'Learn',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
        <path d="M22 3h-6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3h7z" />
      </svg>
    ),
  });
}

export function useAppShellNavigation({
  activeTab,
  isComposingNewSession,
  editingVisitId,
  clearShellOverlays,
  onSetActiveTab,
  onEnterBlankSession,
  onOpenSessionSummary,
  onCloseVisitMenu,
}: UseAppShellNavigationOptions) {
  const [isDesktopViewport, setIsDesktopViewport] = useState(() => window.innerWidth >= 768);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [recentsOpen, setRecentsOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  useEffect(() => {
    const syncSidebarForViewport = () => {
      const isDesktop = window.innerWidth >= 768;
      setIsDesktopViewport(isDesktop);
      setSidebarOpen(isDesktop);
    };

    window.addEventListener('resize', syncSidebarForViewport);
    return () => window.removeEventListener('resize', syncSidebarForViewport);
  }, []);

  const isNewSessionEntryActive = activeTab === 'newSession' && isComposingNewSession;

  const handleSwitchTopLevelTab = (tabId: AppTab) => {
    onSetActiveTab(tabId);
    setRecentsOpen(false);

    if (tabId === 'newSession') {
      onEnterBlankSession();
    }

    clearShellOverlays();

    if (!isDesktopViewport) {
      setSidebarOpen(false);
    }
  };

  const handleSelectVisitSummary = (summaryId: string) => {
    if (editingVisitId === summaryId) return;

    onOpenSessionSummary(summaryId);
    clearShellOverlays();
    onCloseVisitMenu();
    setRecentsOpen(false);

    if (!isDesktopViewport) {
      setSidebarOpen(false);
    }
  };

  const navigationItems = useMemo<NavigationItem[]>(() => {
    return topLevelNavigationBase.map((tab) => ({
      id: tab.id,
      label: tab.label,
      icon: tab.icon,
      isActive: tab.id === 'newSession' ? isNewSessionEntryActive : activeTab === tab.id,
      onSelect: () => handleSwitchTopLevelTab(tab.id),
    }));
  }, [activeTab, isNewSessionEntryActive]);

  const openSidebar = () => {
    setSidebarOpen(true);
  };

  const closeMobileSidebar = () => {
    if (!isDesktopViewport) {
      setSidebarOpen(false);
    }
  };

  const expandSidebar = () => {
    setSidebarCollapsed(false);
  };

  const collapseSidebar = () => {
    if (!isDesktopViewport) {
      setSidebarOpen(false);
      return;
    }

    setSidebarCollapsed(true);
  };

  return {
    isDesktopViewport,
    sidebarOpen,
    setSidebarOpen,
    sidebarCollapsed,
    recentsOpen,
    setRecentsOpen,
    userMenuOpen,
    setUserMenuOpen,
    isNewSessionEntryActive,
    navigationItems,
    handleSelectVisitSummary,
    openSidebar,
    closeMobileSidebar,
    expandSidebar,
    collapseSidebar,
  };
}
