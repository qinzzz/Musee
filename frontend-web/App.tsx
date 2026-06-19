import React, { Suspense, lazy, useState, useRef, useMemo, useEffect, startTransition } from 'react';
import ExifReader from 'exifreader';
import { GalleryItem, NeighborItem, Message, Visit, TagCoordinate, CuratorConversation, Album, AestheticVibe, ArtworkClassification, SessionLink } from './types';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { toast as sonnerToast } from 'sonner';
import GoogleLogin from './components/GoogleLogin';
import {
  analyzeArtworkFromExisting,
  saveArtworkUpload,
  base64ToFile,
  prefetchExploreDataWithContext,
  type ArtworkAnalysisResult,
} from './api/analysis';
import { getCurrentUser, getOrCreateUserId, getUserQuota, logout, type UserQuota } from './api/auth';
import { visitChatStream } from './api/chat';
import {
  deleteArtwork,
  fetchAndPersistInsights,
  type SmartCollection,
} from './api/artworks';
import {
  fetchSessionMessages,
  appendSessionMessages,
  setSessionGoal,
  createSession,
  deleteSession,
  updateSession,
  attachArtworksToSession,
} from './api/sessions';
import {
  fetchCollections,
  createCollection,
  updateCollection,
  deleteCollection,
} from './api/collections';
import GalleryCard from './components/GalleryCard';
import VisitStack from './components/VisitStack';
import InterpretationModal from './components/InterpretationModal';
import EmptyWall from './components/EmptyWall';
import TopographyView from './components/TopographyView';
import ContextualActionBar from './components/ContextualActionBar';
import CanvasHeader from './components/CanvasHeader';
import ArtworkActionsMenu from './components/ArtworkActionsMenu';
import ExploreSessionView from './components/ExploreSessionView';
import AddFromLibraryModal from './components/AddFromLibraryModal';
import { Toaster } from './components/ui/sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from './components/ui/dropdown-menu';
import { useAppNavigationSync } from './hooks/useAppNavigationSync';
import { useArtworkLibrary } from './hooks/useArtworkLibrary';
import { useVisits, type VisitStreamMessage, type VisitDraft, type VisitSummary } from './hooks/useVisits';
import {
  buildRootHistoryState,
  getInitialNavigationState,
  slugifyName,
  stateToPath,
  type ArtistPageContext,
  type ArtworkDetailContext,
  type CollectTab,
  type NavigationHistoryState,
} from './lib/appNavigation';

const CollectView = lazy(() => import('./components/CollectView'));
const TasteProfileView = lazy(() => import('./components/TasteProfileView'));
const UnsortedClassificationModal = lazy(() => import('./components/UnsortedClassificationModal'));
const ArtistPage = lazy(() => import('./components/ArtistPage'));
const ArtMovementPage = lazy(() => import('./components/ArtMovementPage'));
const LearningHubPage = lazy(() => import('./components/LearningHubPage'));

const ScreenLoader: React.FC<{ label?: string }> = ({ label = 'Loading' }) => (
  <div className="flex h-full w-full items-center justify-center bg-[var(--color-bg-primary)]">
    <p className="text-[12px] text-neutral-300">{label}…</p>
  </div>
);

const SessionListSkeleton: React.FC<{ compact?: boolean }> = ({ compact = false }) => (
  <div className={`space-y-2 ${compact ? 'px-1 pb-1' : ''}`}>
    {Array.from({ length: compact ? 4 : 6 }).map((_, index) => (
      <div
        key={index}
        className={`animate-pulse rounded-[22px] border border-neutral-200/70 bg-white/70 ${compact ? 'px-3 py-3' : 'px-4 py-3'}`}
      >
        <div className="h-4 w-32 rounded-full bg-neutral-200/80" />
        <div className="mt-2 h-3 w-20 rounded-full bg-neutral-100" />
      </div>
    ))}
  </div>
);

type PendingSessionArtwork =
  | {
      id: string;
      kind: 'library';
      artwork: GalleryItem;
      previewUrl: string;
      label: string;
      sublabel: string;
    }
  | {
      id: string;
      kind: 'upload';
      file: File;
      previewUrl: string;
      mode: 'gallery' | 'camera';
      timestamp: number;
      photoTime: string;
      coords?: { latitude?: number; longitude?: number };
      location?: string;
      label: string;
      sublabel: string;
    };

type ToastAction = {
  label: string;
  onClick: () => void;
};

type AppTab = 'newSession' | 'collect' | 'profile' | 'learn';
const SHOW_LEARN_TAB = false;

const downscaleImage = (dataUrl: string, maxWidth = 1600): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      console.log('Image loaded, dimensions:', img.width, 'x', img.height);
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      if (width > maxWidth) {
        height = (maxWidth / width) * height;
        width = maxWidth;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);
      const result = canvas.toDataURL('image/jpeg', 0.85);
      console.log('Downscale complete');
      resolve(result);
    };
    img.onerror = (err) => {
      console.error('Image load error:', err);
      reject(new Error('Failed to load image for downscaling'));
    };
    img.src = dataUrl;
  });
};

const parseAnalysis = (text: string | null) => {
  if (!text) return '';
  const trimmed = text.trim();

  // Try to parse if it looks like JSON (starts with [ or {)
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);

      // If it's an array, look for 'analysis' in the first element
      if (Array.isArray(parsed) && parsed.length > 0) {
        if (parsed[0].analysis) return parsed[0].analysis;
        // Fallback: if first element is just a string, return it
        if (typeof parsed[0] === 'string') return parsed[0];
      }
      // If it's a single object, look for 'analysis'
      else if (parsed && typeof parsed === 'object' && parsed.analysis) {
        return parsed.analysis;
      }
    } catch (e) {
      // Not valid JSON or doesn't match our expected structure, 
      // fall through to return original text
      console.warn('Analysis parsing ignored:', e);
    }
  }

  return text;
};

// Helper to format date strings to (Month Day, Year) without time
export const formatDisplayDate = (dateStr: string | null | undefined): string | null => {
  if (!dateStr) return null;
  // If it's a timestamp like "Feb 1, 2026, 8:31:14 PM" or "2026-02-01 20:31:14"
  // We want to just keep the date part. 
  // Custom EXIF format is "Feb 1, 2026" or "2024:12:18 15:30:00"

  try {
    // If it has a comma followed by time, split it
    if (dateStr.includes(', ')) {
      const parts = dateStr.split(', ');
      // Check if second or third part looks like time
      if (parts.length >= 3) {
        return `${parts[0]}, ${parts[1]}`;
      }
    }

    // If it has a space followed by time
    if (dateStr.includes(' ')) {
      const parts = dateStr.split(' ');
      // If it looks like ISO date + time "2026-02-01 20:31:14"
      if (parts[0].includes('-')) {
        const dt = new Date(dateStr);
        if (!isNaN(dt.getTime())) {
          return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        }
      }
      // If it looks like "Feb 1, 2026 20:31:14"
      if (parts.length >= 3 && parts[1].endsWith(',')) {
        return `${parts[0]} ${parts[1]} ${parts[2]}`;
      }
    }

    // Fallback: if it's just a raw ISO string or something
    const dt = new Date(dateStr);
    if (!isNaN(dt.getTime())) {
      return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    return dateStr;
  } catch (e) {
    return dateStr;
  }
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const buildUploadRequestKey = (files: File[], mode: 'gallery' | 'camera'): string => {
  const fileParts = files
    .map((file) => `${file.name}:${file.size}:${file.lastModified}`)
    .sort()
    .join('|');
  return `${mode}:${fileParts}`;
};

const BACKEND_UNSUPPORTED_EXTENSIONS = new Set(['heic', 'heif']);

const isBackendUnsupportedImage = (file: File): boolean => {
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  const mimeType = file.type.toLowerCase();
  return BACKEND_UNSUPPORTED_EXTENSIONS.has(extension) || mimeType.includes('heic') || mimeType.includes('heif');
};

const transcodeImageToJpeg = async (file: File): Promise<File> => {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not decode image for upload.'));
      img.src = objectUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not prepare image for upload.');
    }

    context.drawImage(image, 0, 0);

    const jpegBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Could not convert image to JPEG.'));
      }, 'image/jpeg', 0.92);
    });

    const baseName = file.name.replace(/\.[^/.]+$/, '') || 'camera-capture';
    return new File([jpegBlob], `${baseName}.jpg`, {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const normalizeUploadFile = async (file: File): Promise<File> => {
  if (!isBackendUnsupportedImage(file)) {
    return file;
  }
  return transcodeImageToJpeg(file);
};

const MOCK_NEIGHBORS: NeighborItem[] = [
  {
    id: 'tag-zen',
    mainKeyword: '#Zen',
    resonances: 12,
    coordinate: { x: -0.8, y: -0.5 },
    works: [
      {
        id: 'z1', url: 'https://picsum.photos/id/230/800/1200',
        conversation: [],
      },
      {
        id: 'z2', url: 'https://picsum.photos/id/231/800/1200',
        conversation: [],
      },
      {
        id: 'z3', url: 'https://picsum.photos/id/232/800/1200',
        conversation: [],
      }
    ]
  },
  {
    id: 'tag-brutalist',
    mainKeyword: '#Brutalist',
    resonances: 45,
    coordinate: { x: 0.7, y: 0.6 },
    works: [
      {
        id: 'b1', url: 'https://picsum.photos/id/234/800/1200',
        conversation: [],
      },
      {
        id: 'b2', url: 'https://picsum.photos/id/235/800/1200',
        conversation: [],
      },
      {
        id: 'b3', url: 'https://picsum.photos/id/236/800/1200',
        conversation: [],
      }
    ]
  },
];

// Persistent user ID for the current browser session
const USER_ID = getOrCreateUserId();
const VISIT_DRAFTS_STORAGE_KEY = 'musee_visit_drafts';
const VISIT_STREAMS_STORAGE_KEY = 'musee_visit_streams';
const DEFAULT_VISIT_TITLE = 'Untitled Session';

/**
 * Convert a visit stream into chat-ready {role, text} messages, expanding
 * artwork_capture / artwork_card entries with real artwork metadata so the
 * model sees the artworks inline in the conversation (rather than restated
 * in the system prompt). Empty/unresolved entries are dropped.
 */
const serializeVisitHistory = (
  messages: VisitStreamMessage[],
  items: GalleryItem[],
): { role: 'user' | 'model'; text: string }[] => {
  const byId = new Map<string, GalleryItem>();
  items.forEach((i) => {
    if (i.artworkId) byId.set(i.artworkId, i);
    byId.set(i.id, i);
  });

  const out: { role: 'user' | 'model'; text: string }[] = [];
  for (const m of messages) {
    if (m.type === 'artwork_capture') {
      const art = m.artworkId ? byId.get(m.artworkId) : undefined;
      const label = art
        ? `"${art.artworkName || 'an artwork'}" by ${art.artistName || 'an unknown artist'}`
        : 'an artwork';
      out.push({ role: 'user', text: `I captured ${label}.` });
    } else if (m.type === 'artwork_card') {
      const art = m.artworkId ? byId.get(m.artworkId) : undefined;
      if (!art) {
        out.push({ role: 'model', text: '[Deleted artwork]' });
        continue;
      }
      const bits: string[] = [`${art.artworkName || 'Untitled'} by ${art.artistName || 'Unknown Artist'}`];
      if (art.date) bits.push(`(${art.date})`);
      if (art.medium) bits.push(art.medium);
      let line = bits.join(' — ');
      if (art.description) line += `. ${art.description}`;
      out.push({ role: 'model', text: line });
    } else if (m.text) {
      out.push({ role: m.role as 'user' | 'model', text: m.text });
    }
  }
  return out;
};

const getItemSessionIds = (item: GalleryItem): string[] => {
  if (item.sessionLinks && item.sessionLinks.length > 0) {
    return item.sessionLinks.map((link) => link.sessionId);
  }
  return item.visitId ? [item.visitId] : [];
};

const itemBelongsToSession = (item: GalleryItem, sessionId: string | null | undefined): boolean => {
  if (!sessionId) return false;
  return getItemSessionIds(item).includes(sessionId);
};

const updateSessionLinkForItem = (
  item: GalleryItem,
  sessionId: string,
  updater: (existing: SessionLink | undefined) => SessionLink | null,
): GalleryItem => {
  const existingLinks = item.sessionLinks ? [...item.sessionLinks] : [];
  const existingIndex = existingLinks.findIndex((link) => link.sessionId === sessionId);
  const nextLink = updater(existingIndex >= 0 ? existingLinks[existingIndex] : undefined);

  if (nextLink === null) {
    const filteredLinks = existingLinks.filter((link) => link.sessionId !== sessionId);
    if (filteredLinks.length === 0 && item.visitId !== sessionId) {
      return item;
    }
    return {
      ...item,
      sessionLinks: filteredLinks.length > 0 ? filteredLinks : undefined,
      visitId: item.visitId === sessionId ? undefined : item.visitId,
      sessionTitle: item.visitId === sessionId ? undefined : item.sessionTitle,
    };
  }

  if (existingIndex >= 0) {
    existingLinks[existingIndex] = nextLink;
  } else {
    existingLinks.push(nextLink);
  }

  return {
    ...item,
    sessionLinks: existingLinks,
    visitId: item.visitId || sessionId,
    sessionTitle: item.sessionTitle || nextLink.sessionTitle,
  };
};

const buildSessionLink = (
  sessionId: string | undefined,
  sessionTitle: string | undefined,
  sequenceNumber: number | undefined,
  source: SessionLink['source'],
): SessionLink[] | undefined => {
  if (!sessionId) return undefined;
  return [{
    sessionId,
    sessionTitle,
    sequenceNumber,
    source,
  }];
};

const App: React.FC = () => {
  const initialNavigationState = getInitialNavigationState(window.location.pathname);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const goalGalleryInputRef = useRef<HTMLInputElement>(null);
  const goalCameraInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const visitStreamScrollRef = useRef<HTMLDivElement>(null);
  const visitStreamEndRef = useRef<HTMLDivElement>(null);
  const inFlightUploadKeysRef = useRef<Set<string>>(new Set());
  const [isUnsortedFlowOpen, setIsUnsortedFlowOpen] = useState(false);
  const [tagPositions, setTagPositions] = useState<Record<string, TagCoordinate>>({});
  const [activeTab, setActiveTab] = useState<'newSession' | 'collect' | 'profile' | 'learn'>(initialNavigationState.activeTab);
  const [learningInitialGuide] = useState<string | null>(initialNavigationState.learningInitialGuide);
  const [collectTab, setCollectTab] = useState<CollectTab>(initialNavigationState.collectTab);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showEntrance, setShowEntrance] = useState(false);
  const [pendingSessionArtworks, setPendingSessionArtworks] = useState<PendingSessionArtwork[]>([]);
  const [newSessionDraftMessage, setNewSessionDraftMessage] = useState('');
  const [isLibraryPickerOpen, setIsLibraryPickerOpen] = useState(false);
  const [libraryPickerSearch, setLibraryPickerSearch] = useState('');
  const [isSubmittingPreparedSession, setIsSubmittingPreparedSession] = useState(false);

  // Curator conversation history — persisted to localStorage
  const [curatorConversations, setCuratorConversations] = useState<CuratorConversation[]>(() => {
    try { return JSON.parse(localStorage.getItem('musee_curator_conversations') || '[]'); }
    catch { return []; }
  });
  const [galleryEdges, setGalleryEdges] = useState({ hasPrev: false, hasNext: false });
  const [activeThumbIndex, setActiveThumbIndex] = useState(0);
  const thumbStripRef = useRef<HTMLDivElement>(null);
  const galleryEntryRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(getCurrentUser());
  const locationCache = useRef<Map<string, { city: string, country: string, museum: string }>>(new Map());
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ id: string, type: 'item' | 'session' } | null>(null);
  const [artistPageContext, setArtistPageContext] = useState<ArtistPageContext | null>(initialNavigationState.artistPageContext);
  const [movementPageContext, setMovementPageContext] = useState<SmartCollection | null>(null);
  const [artworkDetailContext, setArtworkDetailContext] = useState<ArtworkDetailContext | null>(null);

  const showToast = (message: string, type: 'info' | 'success' = 'info', action?: ToastAction) => {
    const options = action
      ? {
          action: {
            label: action.label,
            onClick: action.onClick,
          },
        }
      : undefined;

    if (type === 'success') {
      sonnerToast.success(message, options);
      return;
    }

    sonnerToast.info(message, options);
  };

  const {
    items,
    setItems,
    artworksLoaded,
    profileRefreshKey,
    interpretingItem,
    setInterpretingItem,
    buildInterpretingItem,
    restoreArtworkFromHistory,
    handleUpdateClassification,
    updateItemMetadata,
  } = useArtworkLibrary({
    userId: USER_ID,
    showToast,
    onMissingArtworkFromHistory: () => setArtworkDetailContext(null),
    onArtworkDetailContextChange: setArtworkDetailContext,
    onTagPositionsLoaded: (updater) => setTagPositions(updater),
  });

  function openArtworkDetail(item: GalleryItem, context: ArtworkDetailContext, allItems?: GalleryItem[]) {
    setArtworkHeaderEditToken(0);
    setMovementPageContext(null);
    setArtistPageContext(null);
    setArtworkDetailContext(context);
    setInterpretingItem(buildInterpretingItem(item, allItems));
    window.history.pushState(
      {
        view: 'artwork',
        artworkId: item.id,
        artworkContext: context,
        activeTab,
        collectTab,
      } satisfies NavigationHistoryState,
      '',
      context.basePath
    );
  }

  function openArtistDetail(context: ArtistPageContext) {
    setArtistPageContext(context);
    const slugSource = context.artistName || context.artistEntityId;
    if (!slugSource) return;
    window.history.pushState(
      {
        view: 'artist',
        artistContext: context,
        activeTab,
        collectTab,
      } satisfies NavigationHistoryState,
      '',
      `/artists/${slugifyName(slugSource)}`
    );
  }

  function closeArtworkDetail() {
    setArtworkHeaderEditToken(0);
    if (window.history.state?.view === 'artwork') {
      window.history.back();
      return;
    }
    setInterpretingItem(null);
    setArtworkDetailContext(null);
    if (artworkDetailContext?.returnToArtistContext) {
      setArtistPageContext(artworkDetailContext.returnToArtistContext);
      window.history.pushState(
        {
          view: 'artist',
          artistContext: artworkDetailContext.returnToArtistContext,
          activeTab,
          collectTab,
        } satisfies NavigationHistoryState,
        '',
        artworkDetailContext.basePath
      );
    } else {
      window.history.pushState(
        buildRootHistoryState(activeTab, collectTab),
        '',
        artworkDetailContext?.basePath || stateToPath(activeTab, collectTab),
      );
    }
  }

  function closeArtistDetail() {
    if (window.history.state?.view === 'artist') {
      window.history.back();
      return;
    }
    const fallbackPath = '/artists';
    setArtistPageContext(null);
    setActiveTab('collect');
    setCollectTab('artists');
    window.history.pushState(
      {
        view: 'root',
        activeTab: 'collect',
        collectTab: 'artists',
      } satisfies NavigationHistoryState,
      '',
      fallbackPath
    );
  }

  useAppNavigationSync({
    activeTab,
    collectTab,
    artistPageContext,
    movementPageContext,
    artworkDetailContext,
    interpretingItem,
    onRestoreArtworkFromHistory: restoreArtworkFromHistory,
    onSetArtistPageContext: setArtistPageContext,
    onSetMovementPageContext: setMovementPageContext,
    onSetArtworkDetailContext: setArtworkDetailContext,
    onSetActiveTab: setActiveTab,
    onSetCollectTab: setCollectTab,
    onSetInterpretingItem: setInterpretingItem,
  });

  /** 
   * Algorithmic Session Determination (Phase 7)
   * Decides which visitId an artwork belongs to based on view context, time, and location.
   */
  const autoDetermineVisit = async (options: {
    lat?: number,
    lng?: number,
    exifTime?: number,
    contextVisitId?: string | null,
    isBatch?: boolean
  }): Promise<{ visitId: string, isNew: boolean, museumName?: string }> => {
    const { lat, lng, exifTime, contextVisitId, isBatch } = options;
    const currentTime = exifTime || Date.now();
    const resolvedContextVisitId = contextVisitId;

    // 1. Context-Aware Priority: If inside an Exhibition Hall, always use that visitId.
    if (resolvedContextVisitId) {
      const visitItems = items.filter(i => itemBelongsToSession(i, resolvedContextVisitId));
      return { 
        visitId: resolvedContextVisitId, 
        isNew: false, 
        museumName: visitItems[0]?.sessionTitle 
      };
    }

    // 2. Batch Priority: Batch imports (from Corridor) always create a new visit.
    if (isBatch) {
      return { visitId: `batch_${Math.random().toString(36).substring(2, 7)}`, isNew: true };
    }

    // 3. Proximity Logic (Single Upload / Camera):
    // Search for a visit within 6 hours and 1km proximity.
    const TIME_WINDOW = 6 * 60 * 60 * 1000; // 6 hours
    const DISTANCE_THRESHOLD = 1; // 1 km (approximate)

    const findProximitySession = () => {
      const candidates = items.filter(i => getItemSessionIds(i).length > 0);
      
      for (const item of candidates) {
        const memberships = getItemSessionIds(item);
        let currentWindow = TIME_WINDOW;
        let isMuseumMatch = false;

        // Location check
        if (lat !== undefined && lng !== undefined && item.location) {
          try {
            const itemLoc = JSON.parse(item.location);
            if (itemLoc.latitude && itemLoc.longitude) {
              const dLat = (itemLoc.latitude - lat) * 111;
              const dLng = (itemLoc.longitude - lng) * 111 * Math.cos(lat * Math.PI / 180);
              const dist = Math.sqrt(dLat * dLat + dLng * dLng);
              
              if (dist < DISTANCE_THRESHOLD) {
                isMuseumMatch = true;
                // If same museum/landmark, be much more lenient with time (24h)
                currentWindow = 24 * 60 * 60 * 1000;
              }
            }
          } catch (e) { /* skip malformed */ }
        }

        // Time check
        const timeDiff = Math.abs(item.timestamp - currentTime);
        if (timeDiff > currentWindow) continue;

        // Within time window — return match regardless of whether GPS matched
        const itemLoc = (() => { try { return JSON.parse(item.location || '{}'); } catch { return {}; } })();
        return { visitId: memberships[0], museumName: itemLoc.museum || item.sessionTitle };
      }
      return null;
    };

    const match = findProximitySession();
    if (match) {
      return { visitId: match.visitId, isNew: false, museumName: match.museumName };
    }

    // fallback: new visit
    return { visitId: `visit_${Math.random().toString(36).substring(2, 7)}`, isNew: true };
  };
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState<'account' | 'personalization' | null>(null);
  const [quotaInfo, setQuotaInfo] = useState<UserQuota | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [recentsOpen, setRecentsOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [language, setLanguage] = useState(localStorage.getItem('musee_language') || 'en');
  const sessionUserId = currentUser?.user_id || USER_ID;
  const {
    visitSearch,
    setVisitSearch,
    filteredVisitId,
    setFilteredVisitId,
    isComposingNewSession,
    setIsComposingNewSession,
    openVisitMenuId,
    setOpenVisitMenuId,
    editingVisitId,
    setEditingVisitId,
    editingVisitTitle,
    setEditingVisitTitle,
    visitDrafts,
    setVisitDrafts,
    visitStreams,
    setVisitStreams,
    streamingVisitResponses,
    setStreamingVisitResponses,
    sessionGoalDismissed,
    setSessionGoalDismissed,
    sessionGoalInput,
    setSessionGoalInput,
    sessionGoals,
    setSessionGoals,
    persistedSessions,
    visitSummaries,
    activeVisitSummary,
    pendingDeleteVisitSummary,
    activeVisitStream,
    refreshPersistedSessions,
  } = useVisits({
    userId: sessionUserId,
    items,
    artworksLoaded,
    deleteConfirmation,
    defaultVisitTitle: DEFAULT_VISIT_TITLE,
    initialIsComposingNewSession: initialNavigationState.activeTab === 'newSession',
    visitDraftsStorageKey: VISIT_DRAFTS_STORAGE_KEY,
    visitStreamsStorageKey: VISIT_STREAMS_STORAGE_KEY,
    sessionGoalsStorageKey: 'musee_session_goals',
  });

  const pendingLibraryArtworkIds = useMemo(
    () =>
      pendingSessionArtworks
        .filter((entry): entry is Extract<PendingSessionArtwork, { kind: 'library' }> => entry.kind === 'library')
        .map((entry) => entry.artwork.id),
    [pendingSessionArtworks],
  );

  const availableLibraryArtworks = useMemo(
    () =>
      items.filter((item) =>
        !item.isDeletedPlaceholder
        && !item.isAnalyzing
        && Boolean(item.url)
      ),
    [items],
  );

  const resetPreparedSessionState = () => {
    setPendingSessionArtworks([]);
    setNewSessionDraftMessage('');
    setIsLibraryPickerOpen(false);
    setLibraryPickerSearch('');
  };

  const [likedIds, setLikedIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('musee_liked_ids') || '[]')); }
    catch { return new Set(); }
  });

  const [albums, setAlbums] = useState<Album[]>([]);
  const [boardsLoading, setBoardsLoading] = useState(false);

  const handleLoginSuccess = (user: any) => {
    setCurrentUser(user);
    // Reload artworks list for the new user
    window.location.reload();
  };

  const handleLogout = () => {
    logout();
    setCurrentUser(null);
    window.location.reload();
  };

  const handleToggleLike = (id: string) => {
    setLikedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      localStorage.setItem('musee_liked_ids', JSON.stringify([...next]));
      return next;
    });
  };

  const handleAddItemsToBoard = async (boardId: string, itemIds: string[]) => {
    const targetBoard = albums.find(album => album.id === boardId);
    if (!targetBoard) return;

    const nextItemIds = Array.from(new Set([...targetBoard.itemIds, ...itemIds]));
    const updatedBoard = await updateCollection(boardId, { artworkIds: nextItemIds });
    setAlbums(prev => prev.map(album => album.id === boardId ? updatedBoard : album));
    showToast(`Added ${itemIds.length} ${itemIds.length === 1 ? 'artwork' : 'artworks'} to ${updatedBoard.name}`, 'success');
  };

  const handleCreateAlbum = async (name: string, itemIds: string[] = []) => {
    const userId = currentUser?.user_id || USER_ID;
    const created = await createCollection(userId, name, itemIds);
    setAlbums(prev => [created, ...prev]);
    showToast(`Created board "${created.name}"`, 'success');
    return created;
  };

  const handleRenameAlbum = async (boardId: string, name: string) => {
    const updated = await updateCollection(boardId, { name });
    setAlbums(prev => prev.map(album => album.id === boardId ? updated : album));
    return updated;
  };

  const handleDeleteAlbum = async (boardId: string) => {
    const targetBoard = albums.find(album => album.id === boardId);
    await deleteCollection(boardId);
    setAlbums(prev => prev.filter(album => album.id !== boardId));
    showToast(`Deleted board "${targetBoard?.name || 'Untitled'}"`, 'success');
  };

  const stageLibraryArtworkForSession = (item: GalleryItem) => {
    setPendingSessionArtworks((prev) => {
      if (prev.some((entry) => entry.kind === 'library' && entry.artwork.id === item.id)) {
        return prev.filter((entry) => !(entry.kind === 'library' && entry.artwork.id === item.id));
      }
      if (prev.length >= 5) {
        showToast('You can add up to 5 artworks to start a session.', 'info');
        return prev;
      }
      return [
        ...prev,
        {
          id: `library-${item.id}`,
          kind: 'library',
          artwork: item,
          previewUrl: item.url,
          label: item.artworkName || 'Untitled',
          sublabel: item.artistName || item.photoTime || 'Saved artwork',
        },
      ];
    });
  };

  const removePendingSessionArtwork = (entryId: string) => {
    setPendingSessionArtworks((prev) => prev.filter((entry) => entry.id !== entryId));
  };

  const [interpretationRightMode, setInterpretationRightMode] = useState<'metadata' | 'community'>('metadata');
  const [artworkHeaderEditToken, setArtworkHeaderEditToken] = useState(0);

  const [visit, setVisit] = useState<Visit>({
    id: 'initial-' + Math.random().toString(36).substring(7),
    itemIds: [],
    globalConversation: []
  });

  useEffect(() => {
    const userId = currentUser?.user_id || USER_ID;
    let cancelled = false;

    setBoardsLoading(true);
    fetchCollections(userId)
      .then((collections) => {
        if (!cancelled) {
          setAlbums(collections);
        }
      })
      .catch((error) => {
        console.error('Failed to load collections:', error);
        if (!cancelled) {
          setAlbums([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setBoardsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentUser?.user_id]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const resolvedLocation = useRef<string | undefined>(undefined);

  // The filtered view of artworks for "The Corridor"
  const corridorItems = useMemo(() => {
    if (filteredVisitId) return items.filter(i => itemBelongsToSession(i, filteredVisitId));
    return items;
  }, [items, filteredVisitId]);

  const corridorEntries = useMemo(() => {
    // If inside "The Salon" (filteredVisitId), just show individual items
    if (filteredVisitId) return corridorItems.map(item => ({ type: 'item' as const, item }));

    const entries: Array<{ type: 'item', item: GalleryItem } | { type: 'stack', items: GalleryItem[], visitId: string }> = [];
    const visitGroups = new Map<string, GalleryItem[]>();
    const orderOfVisits: string[] = [];

    corridorItems.forEach(item => {
      const sessionIds = getItemSessionIds(item);
      if (sessionIds.length > 0) {
        const primarySessionId = sessionIds[0];
        if (!visitGroups.has(primarySessionId)) {
          visitGroups.set(primarySessionId, []);
          orderOfVisits.push(primarySessionId);
        }
        visitGroups.get(primarySessionId)!.push(item);
      } else {
        // Individual item without visit (should be rare)
        entries.push({ type: 'item', item });
      }
    });

    orderOfVisits.forEach(vid => {
      const group = visitGroups.get(vid)!;
      if (group.length === 1) {
        entries.push({ type: 'item', item: group[0] });
      } else {
        entries.push({ type: 'stack', items: group, visitId: vid });
      }
    });

    return entries;
  }, [corridorItems, filteredVisitId]);

  const thumbEntries = useMemo(() => {
    return corridorEntries
      .map((entry, sourceIndex) => ({
        id: entry.type === 'item' ? entry.item.id : entry.visitId,
        sourceIndex,
        url: entry.type === 'item'
          ? entry.item.url
          : entry.items[entry.items.length - 1]?.url
      }))
      .filter((entry) => Boolean(entry.url));
  }, [corridorEntries]);

  // Active item for metadata / tags display
  const activeDisplayItem = useMemo(() => {
    const entry = corridorEntries[thumbEntries[activeThumbIndex]?.sourceIndex ?? 0];
    if (!entry) return null;
    return entry.type === 'item' ? entry.item : entry.items[entry.items.length - 1] ?? null;
  }, [corridorEntries, thumbEntries, activeThumbIndex]);

  useEffect(() => {
    if (activeTab !== 'newSession' || interpretingItem || !visitStreamEndRef.current || !activeVisitSummary) return;

    requestAnimationFrame(() => {
      visitStreamEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    });
  }, [
    activeTab,
    interpretingItem,
    activeVisitSummary?.id,
    activeVisitStream.length,
    activeVisitSummary ? streamingVisitResponses[activeVisitSummary.id] : '',
  ]);

  // Reset scroll and hydrate conversation from DB when switching sessions
  useEffect(() => {
    if (visitStreamScrollRef.current) visitStreamScrollRef.current.scrollTop = 0;
    if (!activeVisitSummary?.id) return;
    const sessionId = activeVisitSummary.id;
    fetchSessionMessages(sessionId).then(dbMessages => {
      if (!dbMessages.length) return;
      setVisitStreams(prev => {
        const existing = prev[sessionId] || [];
        const existingIds = new Set(existing.map(m => m.id));
        const newMsgs: VisitStreamMessage[] = dbMessages
          .filter(m => !existingIds.has(m.id || ''))
          .map(m => ({
            id: m.id || `db-${Date.now()}-${Math.random()}`,
            role: m.role as 'user' | 'model',
            text: m.content || '',
            type: (m.type || 'text') as VisitStreamMessage['type'],
            artworkId: m.artwork_id || undefined,
            createdAt: m.created_at ? new Date(m.created_at as unknown as string).getTime() : Date.now(),
          }));
        if (!newMsgs.length) return prev;
        return { ...prev, [sessionId]: [...existing, ...newMsgs].sort((a, b) => a.createdAt - b.createdAt) };
      });
    }).catch(() => {});
  }, [activeVisitSummary?.id]);

  useEffect(() => {
    if (!editingVisitId || !renameInputRef.current) return;
    renameInputRef.current.focus();
    renameInputRef.current.select();
  }, [editingVisitId]);

  useEffect(() => {
    const syncSidebarForViewport = () => {
      if (window.innerWidth >= 768) {
        setSidebarOpen(true);
      } else {
        setSidebarOpen(false);
      }
    };

    window.addEventListener('resize', syncSidebarForViewport);
    return () => window.removeEventListener('resize', syncSidebarForViewport);
  }, []);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    
    // 1. Calculate the horizontal center of the viewport relative to the scrollable content
    const viewportCenterX = scrollLeft + (clientWidth / 2);
    
    // Filter to current corridor length to avoid stale refs
    const validRefs = galleryEntryRefs.current.slice(0, corridorEntries.length);

    // 2. Find the entry that encompasses this center point using contiguous boundaries
    const centers = validRefs.map(ref => {
      if (!ref) return -1;
      return ref.offsetLeft + ref.offsetWidth / 2;
    });

    let closestIndex = 0;
    for (let i = 0; i < centers.length; i++) {
      // The boundary for item i is halfway between center[i] and center[i+1]
      const leftBoundary = i === 0 ? 0 : (centers[i-1] + centers[i]) / 2;
      const rightBoundary = i === centers.length - 1 ? scrollWidth : (centers[i] + centers[i+1]) / 2;

      if (viewportCenterX >= leftBoundary && viewportCenterX <= rightBoundary) {
        closestIndex = i;
        break;
      }
    }

    // 3. Update the active index based on physical intersection
    // Resolve this index back to the thumbIndex (which ignores gaps etc)
    const newThumbIndex = thumbEntries.findIndex(te => te.sourceIndex === closestIndex);
    if (newThumbIndex !== -1 && newThumbIndex !== activeThumbIndex) {
      setActiveThumbIndex(newThumbIndex);
    }

    const maxScroll = scrollWidth - clientWidth;
    const edgeThreshold = 6;
    setGalleryEdges({
      hasPrev: scrollLeft > edgeThreshold,
      hasNext: scrollLeft < maxScroll - edgeThreshold
    });

    if (thumbStripRef.current && maxScroll > 0) {
      const thumbMax = thumbStripRef.current.scrollWidth - thumbStripRef.current.clientWidth;
      if (thumbMax > 0) {
        thumbStripRef.current.scrollLeft = (scrollLeft / maxScroll) * thumbMax;
      }
    }
  };

  const handleResumeVisit = (visitId: string) => {
    const visitItems = items.filter(i => itemBelongsToSession(i, visitId));
    setVisit({
      id: visitId,
      itemIds: visitItems.map(i => i.id),
      globalConversation: [] // We don't have global history stored yet, but we can resume adding
    });
  };

  const handleContinueVision = (item: GalleryItem) => {
    // Start a new visit with this item
    const newVisitId = Math.random().toString(36).substring(2, 11);

    // Update the local item to use this new visit ID
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, visitId: newVisitId } : i));

    // Set visit context
    setVisit({
      id: newVisitId,
      itemIds: [item.id],
      globalConversation: []
    });
  };

  const createVisitDraft = () => {
    const now = Date.now();
    const newVisit: VisitDraft = {
      id: `visit_${Math.random().toString(36).substring(2, 11)}`,
      title: DEFAULT_VISIT_TITLE,
      createdAt: now,
      updatedAt: now,
    };
    setVisitDrafts(prev => [newVisit, ...prev.filter(v => v.id !== newVisit.id)]);
    setFilteredVisitId(newVisit.id);
    setIsComposingNewSession(false);
    setVisit({
      id: newVisit.id,
      itemIds: [],
      globalConversation: [],
    });
    return newVisit.id;
  };

  const ensureSessionRecord = async (sessionId: string) => {
    const summary = visitSummaries.find(visitSummary => visitSummary.id === sessionId);
    const response = await createSession(sessionUserId, sessionId, summary?.title || DEFAULT_VISIT_TITLE);
    refreshPersistedSessions();
    return response;
  };

  const resolveUploadSession = () => {
    if (filteredVisitId) {
      return { visitId: filteredVisitId, isNew: false };
    }

    const visitId = createVisitDraft();
    return { visitId, isNew: true };
  };
  const appendVisitMessages = (visitId: string, newMessages: VisitStreamMessage[]) => {
    setVisitStreams(prev => ({
      ...prev,
      [visitId]: [...(prev[visitId] || []), ...newMessages],
    }));
    setVisitDrafts(prev => {
      const nextUpdatedAt = newMessages[newMessages.length - 1]?.createdAt || Date.now();
      const existingDraft = prev.find((draft) => draft.id === visitId);
      if (existingDraft) {
        return prev.map((draft) =>
          draft.id === visitId ? { ...draft, updatedAt: nextUpdatedAt } : draft
        );
      }
      const summary = visitSummaries.find((visitSummary) => visitSummary.id === visitId);
      return [
        {
          id: visitId,
          title: summary?.title || DEFAULT_VISIT_TITLE,
          createdAt: nextUpdatedAt,
          updatedAt: nextUpdatedAt,
        },
        ...prev,
      ];
    });
    // Fire-and-forget persist to DB
    appendSessionMessages(visitId, newMessages.map(m => {
      // artwork_capture / artwork_card are placeholders rendered from the card UI —
      // they carry no text. Everything else (user + model text) persists its content.
      const isPlaceholder = m.type === 'artwork_capture' || m.type === 'artwork_card';
      return {
        id: m.id,
        role: m.role as 'user' | 'model',
        type: m.type || 'text',
        content: isPlaceholder ? undefined : m.text,
        artwork_id: m.artworkId,
        created_at: m.createdAt,
      };
    })).finally(() => {
      refreshPersistedSessions();
    });
  };

  const triggerUploadCommentary = (
    visitId: string,
    newArtworks: Array<Partial<Pick<GalleryItem, 'artistName' | 'artworkName' | 'description' | 'keywords' | 'date' | 'medium' | 'isAnalyzing'>>>,
    sessionItems: GalleryItem[],
    conversationHistory: VisitStreamMessage[],
  ) => {
    if (newArtworks.length === 0) return;
    const sessionGoal = sessionGoals[visitId];

    let trigger: string;
    if (newArtworks.length === 1) {
      const a = newArtworks[0];
      const goalClause = sessionGoal
        ? ` Connect your observation to the visitor's stated goal for this visit: "${sessionGoal}".`
        : ' Add a brief personal observation or connection to other works seen today.';
      trigger = `I just captured "${a.artworkName || 'an artwork'}" by ${a.artistName || 'the artist'}. Write a short response (3–4 sentences): (1) introduce the artist and title naturally, (2) give a one-sentence interpretation of the work, (3)${goalClause} Warm, conversational tone — assume the user may not have opened the artwork card.`;
    } else {
      const list = newArtworks
        .map(a => `"${a.artworkName || 'an artwork'}" by ${a.artistName || 'an unknown artist'}`)
        .join(', ');
      const goalClause = sessionGoal
        ? ` Tie it to the visitor's stated goal for this visit: "${sessionGoal}".`
        : '';
      trigger = `I just captured ${newArtworks.length} artworks at once: ${list}. Write ONE short, warm response (3–5 sentences) reacting to this group as a whole — point out a shared thread, an interesting contrast, or what they suggest together. Don't walk through them one by one or repeat the card details.${goalClause} Assume the user may not have opened the artwork cards.`;
    }
    setStreamingVisitResponses(prev => ({ ...prev, [visitId]: '' }));
    visitChatStream(
      sessionItems.map(i => ({
        id: i.id, url: i.url, keywords: i.keywords,
        artistName: i.artistName, artworkName: i.artworkName,
        description: i.description, date: i.date, medium: i.medium,
      })),
      serializeVisitHistory(conversationHistory, sessionItems),
      trigger,
      (chunk) => setStreamingVisitResponses(prev => ({ ...prev, [visitId]: (prev[visitId] || '') + chunk })),
      (fullResponse) => {
        const msg: VisitStreamMessage = {
          id: `commentary-${Date.now()}`,
          role: 'model',
          text: fullResponse,
          createdAt: Date.now(),
        };
        appendVisitMessages(visitId, [msg]);
        setStreamingVisitResponses(prev => { const n = { ...prev }; delete n[visitId]; return n; });
      },
      () => {
        setStreamingVisitResponses(prev => { const n = { ...prev }; delete n[visitId]; return n; });
      },
    );
  };

  const sendVisitInquiryToSession = (
    targetVisitId: string,
    text: string,
    visitItemsOverride?: GalleryItem[],
    options?: { persistUserMessage?: boolean },
  ) => {
    const existingMessages = visitStreams[targetVisitId] || [];
    if (options?.persistUserMessage !== false) {
      const createdAt = Date.now();
      const userMsg: VisitStreamMessage = {
        id: `visit-msg-${createdAt}`,
        role: 'user',
        text,
        createdAt,
      };
      appendVisitMessages(targetVisitId, [userMsg]);
    }
    setStreamingVisitResponses(prev => ({ ...prev, [targetVisitId]: '' }));

    const visitItems = visitItemsOverride
      || (activeVisitSummary?.id === targetVisitId
        ? activeVisitSummary.items
        : items.filter(item => itemBelongsToSession(item, targetVisitId)));

    visitChatStream(
      visitItems.map(i => ({
        id: i.id,
        url: i.url,
        keywords: i.keywords,
        artistName: i.artistName,
        artworkName: i.artworkName,
        description: i.description,
        date: i.date,
        medium: i.medium,
      })),
      serializeVisitHistory(existingMessages, visitItems),
      text,
      (chunk) => {
        setStreamingVisitResponses(prev => ({
          ...prev,
          [targetVisitId]: (prev[targetVisitId] || '') + chunk,
        }));
      },
      (fullResponse) => {
        const assistantMsg: VisitStreamMessage = {
          id: `visit-msg-${Date.now()}-assistant`,
          role: 'model',
          text: fullResponse,
          createdAt: Date.now(),
        };
        appendVisitMessages(targetVisitId, [assistantMsg]);
        setStreamingVisitResponses(prev => {
          const next = { ...prev };
          delete next[targetVisitId];
          return next;
        });
      },
      () => {
        const assistantMsg: VisitStreamMessage = {
          id: `visit-msg-${Date.now()}-error`,
          role: 'model',
          text: 'Something interrupted the reflection stream. Please try again.',
          createdAt: Date.now(),
        };
        appendVisitMessages(targetVisitId, [assistantMsg]);
        setStreamingVisitResponses(prev => {
          const next = { ...prev };
          delete next[targetVisitId];
          return next;
        });
      }
    );
  };

  const buildPreparedSessionFallbackPrompt = (
    entries: PendingSessionArtwork[],
  ): string => {
    const libraryTitles = entries
      .filter((entry): entry is Extract<PendingSessionArtwork, { kind: 'library' }> => entry.kind === 'library')
      .map((entry) => `"${entry.artwork.artworkName || 'Untitled'}" by ${entry.artwork.artistName || 'Unknown Artist'}`);
    const uploadCount = entries.filter((entry) => entry.kind === 'upload').length;

    if (uploadCount > 0 && libraryTitles.length > 0) {
      return `I just started a session with ${uploadCount} new upload${uploadCount === 1 ? '' : 's'} and ${libraryTitles.length} saved artwork${libraryTitles.length === 1 ? '' : 's'} from my library (${libraryTitles.join(', ')}). Help me find the most interesting visual, thematic, or historical connections across them.`;
    }
    if (uploadCount > 0) {
      return `I just started a session with ${uploadCount} new upload${uploadCount === 1 ? '' : 's'}. Help me understand what stands out across these works and where I should look first.`;
    }
    return `I just started a session with these saved artworks. Help me find the strongest thread that connects them and suggest a good first question to explore.`;
  };

  const submitPreparedSession = async () => {
    if (pendingSessionArtworks.length === 0 || isSubmittingPreparedSession) {
      return;
    }

    setIsSubmittingPreparedSession(true);

    try {
      const created = await createSession(sessionUserId, undefined, DEFAULT_VISIT_TITLE);
      refreshPersistedSessions();
      const sessionId = created?.session?.id as string;
      const sessionTitle = created?.session?.title || DEFAULT_VISIT_TITLE;
      const now = Date.now();

      const libraryEntries = pendingSessionArtworks.filter(
        (entry): entry is Extract<PendingSessionArtwork, { kind: 'library' }> => entry.kind === 'library',
      );
      const uploadEntries = pendingSessionArtworks.filter(
        (entry): entry is Extract<PendingSessionArtwork, { kind: 'upload' }> => entry.kind === 'upload',
      );

      if (libraryEntries.length > 0) {
        await attachArtworksToSession(sessionId, sessionUserId, libraryEntries.map((entry) => entry.artwork.artworkId || entry.artwork.id));
        refreshPersistedSessions();
      }

      setVisitDrafts(prev => [
        { id: sessionId, title: sessionTitle, createdAt: now, updatedAt: now },
        ...prev.filter((draft) => draft.id !== sessionId),
      ]);

      const libraryStreamMessages: VisitStreamMessage[] = [];
      let streamCursor = now;
      setItems(prev => {
        const next = prev.map((item) => {
          const matchingEntry = libraryEntries.find((entry) => entry.artwork.id === item.id);
          if (!matchingEntry) return item;
          const sequenceNumber = pendingSessionArtworks.findIndex((entry) => entry.id === matchingEntry.id);
          return updateSessionLinkForItem(item, sessionId, () => ({
            sessionId,
            sessionTitle,
            sequenceNumber,
            source: 'library',
          }));
        });
        return next;
      });

      libraryEntries.forEach((entry) => {
        const artworkId = entry.artwork.artworkId || entry.artwork.id;
        libraryStreamMessages.push(
          { id: `capture-${sessionId}-${artworkId}`, role: 'user', text: '', type: 'artwork_capture', artworkId, createdAt: streamCursor++ },
          { id: `card-${sessionId}-${artworkId}`, role: 'model', text: '', type: 'artwork_card', artworkId, createdAt: streamCursor++ },
        );
      });

      if (libraryStreamMessages.length > 0) {
        appendVisitMessages(sessionId, libraryStreamMessages);
      }

      setActiveTab('newSession');
      setFilteredVisitId(sessionId);
      setIsComposingNewSession(false);
      setVisit({ id: sessionId, itemIds: [], globalConversation: [] });
      startTransition(() => {
        resetPreparedSessionState();
      });

      const resolvedSessionItems: GalleryItem[] = libraryEntries.map((entry, index) =>
        updateSessionLinkForItem(entry.artwork, sessionId, () => ({
          sessionId,
          sessionTitle,
          sequenceNumber: index,
          source: 'library',
        })),
      );

      for (const uploadEntry of uploadEntries) {
        let persistedItemId: string | null = null;
        let placeholderId: string | null = null;
        try {
          const sequenceNumber = pendingSessionArtworks.findIndex((entry) => entry.id === uploadEntry.id);
          const placeholder = createLocalUploadPlaceholder({
            previewUrl: uploadEntry.previewUrl,
            mode: uploadEntry.mode,
            timestamp: uploadEntry.timestamp,
            photoTime: uploadEntry.photoTime,
            location: uploadEntry.location,
            sessionId,
            sessionTitle,
            sequenceNumber,
          });
          placeholderId = placeholder.id;
          setItems(prev => [placeholder, ...prev]);
          setVisit(prev => ({ ...prev, itemIds: [...prev.itemIds, placeholder.id] }));
          resolvedSessionItems.push(placeholder);

          const persistedItem = await persistRawArtwork({
            file: uploadEntry.file,
            previewUrl: uploadEntry.previewUrl,
            mode: uploadEntry.mode,
            timestamp: uploadEntry.timestamp,
            photoTime: uploadEntry.photoTime,
            coords: uploadEntry.coords,
            location: uploadEntry.location,
            sessionId,
            sessionTitle,
            sequenceNumber,
          });
          persistedItemId = persistedItem.id;
          const liveItem = reconcilePlaceholderWithSavedArtwork(placeholder, persistedItem);
          resolvedSessionItems[resolvedSessionItems.length - 1] = liveItem;
          appendVisitMessages(sessionId, [
            { id: `capture-${placeholder.id}`, role: 'user', text: '', type: 'artwork_capture', artworkId: persistedItem.artworkId!, createdAt: Date.now() },
            { id: `card-${placeholder.id}`, role: 'model', text: '', type: 'artwork_card', artworkId: persistedItem.artworkId!, createdAt: Date.now() + 1 },
          ]);

          const analysis = await analyzeArtworkFromExisting(persistedItem.artworkId!);
          applyArtworkAnalysisResult(persistedItem.id, analysis, {
            sessionTitle,
            visitId: sessionId,
            sessionLinks: buildSessionLink(
              sessionId,
              analysis.session_title || sessionTitle,
              sequenceNumber,
              uploadEntry.mode === 'camera' ? 'camera' : 'upload',
            ),
          });
          resolvedSessionItems[resolvedSessionItems.length - 1] = {
            ...liveItem,
            artistName: analysis.artist_name,
            artworkName: analysis.artwork_name,
            description: parseAnalysis(analysis.description),
            date: analysis.date,
            medium: analysis.medium,
            keywords: analysis.tags,
            isAnalyzing: false,
            analysisStatus: 'analyzed',
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Analysis failed.';
          console.error('Failed to save/analyze staged upload:', error);
          if (placeholderId && persistedItemId) {
            markArtworkAnalysisFailed(persistedItemId, message);
          } else if (placeholderId) {
            removeUploadPlaceholder(placeholderId);
          }
        }
      }

      if (newSessionDraftMessage.trim()) {
        window.setTimeout(() => {
          sendVisitInquiryToSession(sessionId, newSessionDraftMessage.trim(), resolvedSessionItems);
        }, 0);
      } else {
        window.setTimeout(() => {
          sendVisitInquiryToSession(
            sessionId,
            buildPreparedSessionFallbackPrompt(pendingSessionArtworks),
            resolvedSessionItems,
            { persistUserMessage: false },
          );
        }, 0);
      }
    } catch (error) {
      console.error('Failed to start prepared session:', error);
      showToast('Could not start session from selected artworks.', 'info');
    } finally {
      setIsSubmittingPreparedSession(false);
    }
  };

  const handleVisitInquiry = async (text: string) => {
    let targetVisitId = activeVisitSummary?.id;
    if (!targetVisitId || isComposingNewSession) {
      targetVisitId = createVisitDraft();
    }

    const targetSummary = visitSummaries.find(summary => summary.id === targetVisitId);
    const shouldPersistSession = !targetSummary || targetSummary.items.length === 0;

    if (shouldPersistSession) {
      try {
        await ensureSessionRecord(targetVisitId);
      } catch (error) {
        console.error('Failed to create session before reflection:', error);
        showToast('Could not start session', 'info');
        return;
      }
    }

    sendVisitInquiryToSession(targetVisitId, text);
  };

  useEffect(() => {
    if (!scrollRef.current || activeTab !== 'newSession') return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    const maxScroll = scrollWidth - clientWidth;
    const edgeThreshold = 6;
    setGalleryEdges({
      hasPrev: scrollLeft > edgeThreshold,
      hasNext: scrollLeft < maxScroll - edgeThreshold
    });
    const progress = maxScroll > 0 ? scrollLeft / maxScroll : 0;
    setActiveThumbIndex(Math.round(progress * Math.max(thumbEntries.length - 1, 0)));
    if (thumbStripRef.current) {
      const thumbMax = thumbStripRef.current.scrollWidth - thumbStripRef.current.clientWidth;
      if (thumbMax > 0 && maxScroll > 0) {
        thumbStripRef.current.scrollLeft = (scrollLeft / maxScroll) * thumbMax;
      }
    }
  }, [items.length, isAnalyzing, filteredVisitId, activeTab, thumbEntries.length]);

  /* ── EXIF Metadata: read lat/lon/timestamp from image ──── */
  const readExifMetadata = async (file: File) => {
    try {
      const tags = await ExifReader.load(file, { expanded: true });
      const lat = tags.gps?.Latitude;
      const lon = tags.gps?.Longitude;
      
      // Try to find the original creation date
      const exif = tags.exif as any;
      const dt = exif?.DateTimeOriginal?.description || 
                 exif?.CreateDate?.description || 
                 exif?.DateTime?.description;
      
      let timestamp: number | undefined = undefined;
      if (dt) {
        // EXIF dates are usually "YYYY:MM:DD HH:MM:SS"
        const parts = dt.split(' ');
        if (parts.length === 2) {
          const datePart = parts[0].replace(/:/g, '-');
          const timePart = parts[1];
          const parsed = new Date(`${datePart}T${timePart}`);
          if (!isNaN(parsed.getTime())) {
            timestamp = parsed.getTime();
          }
        }
      }

      return {
        latitude: typeof lat === 'number' ? lat : undefined,
        longitude: typeof lon === 'number' ? lon : undefined,
        timestamp
      };
    } catch {
      return { latitude: undefined, longitude: undefined, timestamp: undefined };
    }
  };

  const readExifGps = async (file: File): Promise<{ latitude: number; longitude: number } | undefined> => {
    const meta = await readExifMetadata(file);
    if (meta.latitude !== undefined && meta.longitude !== undefined) {
      return { latitude: meta.latitude, longitude: meta.longitude };
    }
    return undefined;
  };

  /* ── Nominatim + Overpass museum resolution ─────────────── */
  const MUSEUM_OSM_VALUES = new Set(['museum', 'gallery', 'arts_centre', 'art_gallery', 'exhibition_centre']);

  const findMuseumNearby = async (lat: number, lon: number, radius = 400): Promise<string> => {
    const query =
      `[out:json][timeout:6];` +
      `(node["tourism"~"^(museum|gallery|arts_centre)$"](around:${radius},${lat},${lon});` +
      `way["tourism"~"^(museum|gallery|arts_centre)$"](around:${radius},${lat},${lon});` +
      `relation["tourism"~"^(museum|gallery|arts_centre)$"](around:${radius},${lat},${lon}););` +
      `out center;`; // no limit — pick the closest ourselves
    try {
      const res = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: new URLSearchParams({ data: query }),
      });
      const json = await res.json();
      const elements: any[] = json.elements ?? [];
      if (!elements.length) return '';
      // Overpass returns results in OSM-ID order, not by proximity.
      // Nodes have top-level lat/lon; ways/relations get a synthetic "center" from `out center`.
      const distSq = (el: any) => {
        const c = el.center ?? el;
        const dlat = (c.lat ?? lat) - lat;
        const dlon = (c.lon ?? lon) - lon;
        return dlat * dlat + dlon * dlon;
      };
      const nearest = elements.reduce((a: any, b: any) => distSq(a) <= distSq(b) ? a : b);
      return nearest.tags?.name ?? '';
    } catch {
      return '';
    }
  };

  const resolveMuseum = async (
    lat: number,
    lon: number
  ): Promise<{ city: string; country: string; museum: string }> => {
    // 4 decimal places = ~11m precision, perfect for grouping photos in the same museum
    const cacheKey = `${lat.toFixed(4)},${lon.toFixed(4)}`;
    if (locationCache.current.has(cacheKey)) {
      console.log('Using cached location for', cacheKey);
      return locationCache.current.get(cacheKey)!;
    }

    let city = '', country = '', museum = '';
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=jsonv2`,
        { headers: { 'User-Agent': 'Musee-App/1.0' } }
      );
      const data = await res.json();
      const addr = data.address ?? {};
      city = addr.city ?? addr.town ?? addr.village ?? addr.county ?? '';
      country = addr.country ?? '';

      // data.type = OSM tag value ("museum", "tertiary", etc.)
      // addr.tourism = venue name when tagged as tourism=museum
      const osmType = (data.type ?? '').toLowerCase();
      const tourismTag = (addr.tourism ?? '').toLowerCase();
      const amenityTag = (addr.amenity ?? '').toLowerCase();
      if (MUSEUM_OSM_VALUES.has(osmType)) {
        museum = data.name ?? addr.tourism ?? '';
      } else if (MUSEUM_OSM_VALUES.has(tourismTag) || MUSEUM_OSM_VALUES.has(amenityTag)) {
        museum = addr.tourism ?? addr.amenity ?? data.name ?? '';
      }
    } catch {
      // Nominatim failed — fall through to Overpass
    }

    // Overpass fallback: GPS may have landed on a road inside a museum campus
    if (!museum) {
      museum = await findMuseumNearby(lat, lon);
    }

    const result = { city, country, museum };
    locationCache.current.set(cacheKey, result);
    return result;
  };

  const getCurrentLocation = async (): Promise<{ latitude: number, longitude: number } | undefined> => {
    return new Promise((resolve) => {
      let settled = false;
      const resolveOnce = (value: { latitude: number, longitude: number } | undefined) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      if (!navigator.geolocation) {
        resolveOnce(undefined);
        return;
      }

      // Don't block uploads on browsers that delay or suppress permission prompts.
      const failFastTimer = window.setTimeout(() => resolveOnce(undefined), 1200);

      navigator.geolocation.getCurrentPosition(
        (position) => {
          window.clearTimeout(failFastTimer);
          const { latitude, longitude } = position.coords;
          resolveOnce({ latitude, longitude });
        },
        (error) => {
          window.clearTimeout(failFastTimer);
          console.warn('Geolocation error:', error);
          resolveOnce(undefined);
        },
        { timeout: 1500, enableHighAccuracy: false }
      );
    });
  };

  const updateSavedArtworkInState = React.useCallback((
    targetId: string,
    updates: Partial<GalleryItem>,
  ) => {
    setItems((prev) => prev.map((item) => {
      if (item.id !== targetId && item.artworkId !== targetId) return item;
      return { ...item, ...updates };
    }));
    setInterpretingItem((prev) => {
      if (!prev || (prev.id !== targetId && prev.artworkId !== targetId)) return prev;
      return { ...prev, ...updates };
    });
  }, [setItems, setInterpretingItem]);

  const markArtworkAnalysisFailed = React.useCallback((
    itemId: string,
    message: string,
  ) => {
    updateSavedArtworkInState(itemId, {
      isAnalyzing: false,
      analysisStatus: 'failed',
      analysisError: message,
      streamingText: message,
      syncStatus: 'synced',
    });
  }, [updateSavedArtworkInState]);

  const applyArtworkAnalysisResult = React.useCallback((
    itemId: string,
    analysis: ArtworkAnalysisResult,
    extras?: Partial<GalleryItem>,
  ) => {
    const keywords = analysis.tags.map((tag: string) => tag.startsWith('#') ? tag.toLowerCase() : `#${tag.toLowerCase()}`);
    setTagPositions(prev => {
      const updated = { ...prev };
      keywords.forEach((tag: string) => {
        if (!updated[tag]) updated[tag] = { x: (Math.random() * 2 - 1), y: (Math.random() * 2 - 1) };
      });
      return updated;
    });

    updateSavedArtworkInState(itemId, {
      keywords,
      artistName: analysis.artist_name,
      artworkName: analysis.artwork_name,
      description: parseAnalysis(analysis.description),
      date: analysis.date,
      medium: analysis.medium,
      artworkId: analysis.artwork_id,
      isAnalyzing: false,
      analysisStatus: 'analyzed',
      analysisError: undefined,
      streamingText: undefined,
      syncStatus: 'synced',
      location: analysis.location && typeof analysis.location === 'object' ? JSON.stringify(analysis.location) : analysis.location,
      photoTime: analysis.photo_time,
      referenceUrls: analysis.reference_urls || [],
      artistEntityId: analysis.artist_entity_id || undefined,
      ...extras,
    });
  }, [setTagPositions, updateSavedArtworkInState]);

  const createLocalUploadPlaceholder = React.useCallback((options: {
    previewUrl: string;
    timestamp: number;
    photoTime: string;
    location?: string;
    sessionId?: string;
    sessionTitle?: string;
    sequenceNumber?: number;
    mode: 'gallery' | 'camera';
  }): GalleryItem => {
    const source: SessionLink['source'] = options.mode === 'camera' ? 'camera' : 'upload';
    return {
      id: `upload-placeholder-${Math.random().toString(36).slice(2, 11)}`,
      url: options.previewUrl,
      keywords: [],
      vibe: { backgroundColor: '#ffffff', padding: 4, borderRadius: '12px', borderType: 'solid', accentColor: '#000000' },
      timestamp: options.timestamp,
      sessionCapturedAt: Date.now(),
      conversation: [],
      visitId: options.sessionId,
      sessionTitle: options.sessionTitle,
      sessionLinks: buildSessionLink(
        options.sessionId,
        options.sessionTitle,
        options.sequenceNumber,
        source,
      ),
      isAnalyzing: true,
      analysisStatus: 'pending',
      analysisError: undefined,
      syncStatus: 'pending',
      location: options.location,
      photoTime: options.photoTime,
      artistName: 'Unknown Artist',
      artworkName: 'Untitled',
    };
  }, []);

  const reconcilePlaceholderWithSavedArtwork = React.useCallback((
    placeholder: GalleryItem,
    persistedItem: GalleryItem,
  ): GalleryItem => {
    const reconciled: GalleryItem = {
      ...placeholder,
      id: persistedItem.id,
      artworkId: persistedItem.artworkId,
      visitId: persistedItem.visitId,
      sessionTitle: persistedItem.sessionTitle,
      sessionLinks: persistedItem.sessionLinks,
      location: persistedItem.location,
      photoTime: persistedItem.photoTime,
      artistName: persistedItem.artistName,
      artworkName: persistedItem.artworkName,
      analysisStatus: persistedItem.analysisStatus,
      analysisError: undefined,
      syncStatus: 'synced',
      isAnalyzing: true,
    };
    setItems((prev) => prev.map((item) => (
      item.id === placeholder.id
        ? reconciled
        : item
    )));
    setVisit((prev) => ({
      ...prev,
      itemIds: prev.itemIds.map((id) => (id === placeholder.id ? persistedItem.id : id)),
    }));
    setInterpretingItem((prev) => (
      prev?.id === placeholder.id
        ? reconciled
        : prev
    ));
    return reconciled;
  }, [setItems, setVisit, setInterpretingItem]);

  const removeUploadPlaceholder = React.useCallback((placeholderId: string) => {
    setItems((prev) => prev.filter((item) => item.id !== placeholderId));
    setVisit((prev) => ({ ...prev, itemIds: prev.itemIds.filter((id) => id !== placeholderId) }));
    setInterpretingItem((prev) => (prev?.id === placeholderId ? null : prev));
  }, [setItems, setVisit, setInterpretingItem]);

  const persistRawArtwork = React.useCallback(async (options: {
    file: File;
    previewUrl: string;
    mode: 'gallery' | 'camera';
    timestamp: number;
    photoTime: string;
    coords?: { latitude?: number; longitude?: number };
    location?: string;
    sessionId?: string;
    sessionTitle?: string;
    sequenceNumber?: number;
  }): Promise<GalleryItem> => {
    const source: SessionLink['source'] = options.mode === 'camera' ? 'camera' : 'upload';
    const saved = await saveArtworkUpload(
      options.file,
      USER_ID,
      options.sessionId,
      options.location,
      options.photoTime,
      options.coords?.latitude,
      options.coords?.longitude,
      source,
      options.sequenceNumber,
    );

    return {
      id: saved.id,
      artworkId: saved.id,
      url: options.previewUrl,
      keywords: [],
      vibe: { backgroundColor: '#ffffff', padding: 4, borderRadius: '12px', borderType: 'solid', accentColor: '#000000' },
      timestamp: options.timestamp,
      sessionCapturedAt: Date.now(),
      conversation: [],
      visitId: options.sessionId,
      sessionTitle: saved.session_title || options.sessionTitle,
      sessionLinks: buildSessionLink(
        options.sessionId,
        saved.session_title || options.sessionTitle,
        options.sequenceNumber,
        source,
      ),
      isAnalyzing: true,
      analysisStatus: 'pending',
      analysisError: undefined,
      syncStatus: 'synced',
      location: saved.location && typeof saved.location === 'object' ? JSON.stringify(saved.location) : saved.location || options.location,
      photoTime: saved.photo_time || options.photoTime,
      artistName: saved.artist_name || 'Unknown Artist',
      artworkName: saved.artwork_name || 'Untitled',
    };
  }, []);

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
    mode: 'gallery' | 'camera' = 'camera'
  ) => {
    const target = event.target as HTMLInputElement;
    const rawFiles = Array.from(target.files || []);
    const files = await Promise.all(rawFiles.map((file) => normalizeUploadFile(file)));
    if (files.length === 0) return;
    const isNewSessionCompose = activeTab === 'newSession' && isComposingNewSession;
    const shouldStageUpload =
      isNewSessionCompose &&
      (
        mode === 'gallery' ||
        pendingSessionArtworks.length > 0
      );

    if (shouldStageUpload) {
      const remainingSlots = Math.max(0, 5 - pendingSessionArtworks.length);
      if (remainingSlots === 0) {
        showToast('You can add up to 5 artworks to start a session.', 'info');
        if (target) target.value = '';
        return;
      }

      const filesToStage = files.slice(0, remainingSlots);
      if (filesToStage.length < files.length) {
        showToast('Only the first 5 artworks can be added to a new session.', 'info');
      }

      const stagedEntries = await Promise.all(
        filesToStage.map(async (file) => {
          const metadata = mode === 'gallery'
            ? await readExifMetadata(file)
            : { latitude: undefined, longitude: undefined, timestamp: undefined };
          let coords = { latitude: metadata.latitude, longitude: metadata.longitude };
          if (mode === 'camera' && coords.latitude === undefined) {
            const current = await getCurrentLocation().catch(() => undefined);
            if (current) coords = current;
          }
          const timestamp = metadata.timestamp || Date.now();
          const photoTime = new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          const previewUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });

          return {
            id: `upload-${Math.random().toString(36).substring(2, 11)}`,
            kind: 'upload' as const,
            file,
            previewUrl,
            mode,
            timestamp,
            photoTime,
            coords,
            label: file.name.replace(/\.[^/.]+$/, '') || 'New upload',
            sublabel: mode === 'camera' ? 'Camera capture' : photoTime,
          };
        }),
      );

      startTransition(() => {
        setPendingSessionArtworks((prev) => [...prev, ...stagedEntries]);
      });

      if (target) target.value = '';
      return;
    }
    const isLibraryOnlyUpload = activeTab === 'collect';
    const collectionUploadSuccessMessage =
      files.length === 1 ? 'Added an artwork to collection' : `Added ${files.length} artworks to collection`;
    const uploadKey = buildUploadRequestKey(files, mode);

    if (inFlightUploadKeysRef.current.has(uploadKey)) {
      console.warn('Ignoring duplicate upload request while analysis is already in progress:', uploadKey);
      if (target) target.value = '';
      return;
    }

    inFlightUploadKeysRef.current.add(uploadKey);

    try {
      if (files.length === 1) {
        const file = files[0];
        const metadata = mode === 'gallery'
          ? await readExifMetadata(file)
          : { latitude: undefined, longitude: undefined, timestamp: undefined };

        let coords = { latitude: metadata.latitude, longitude: metadata.longitude };
        if (mode === 'camera' && coords.latitude === undefined) {
          const current = await getCurrentLocation().catch(() => undefined);
          if (current) coords = current;
        }

        const photoTimestamp = metadata.timestamp || Date.now();
        const photoTime = new Date(photoTimestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

        setIsAnalyzing(true);
        let placeholder: GalleryItem | null = null;

        try {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });

          const { visitId, isNew } = isLibraryOnlyUpload
            ? { visitId: undefined, isNew: false }
            : resolveUploadSession();

          if (isNew && visitId) {
            const now = Date.now();
            const newVisit: VisitDraft = {
              id: visitId,
              title: DEFAULT_VISIT_TITLE,
              createdAt: now,
              updatedAt: now,
            };
            setVisitDrafts(prev => [newVisit, ...prev.filter(v => v.id !== visitId)]);
          }

          placeholder = createLocalUploadPlaceholder({
            previewUrl: base64,
            mode,
            timestamp: photoTimestamp,
            photoTime,
            location: coords.latitude !== undefined
              ? JSON.stringify({ latitude: coords.latitude, longitude: coords.longitude, city: '', country: '', museum: '' })
              : undefined,
            sessionId: visitId,
            sessionTitle: DEFAULT_VISIT_TITLE,
            sequenceNumber: 0,
          });

          setItems(prev => [placeholder, ...prev]);
          if (visitId) {
            setVisit(prev => ({ ...prev, itemIds: [...prev.itemIds, placeholder.id] }));
          }

          const persistedItem = await persistRawArtwork({
            file,
            previewUrl: base64,
            mode,
            timestamp: photoTimestamp,
            photoTime,
            coords,
            location: coords.latitude !== undefined
              ? JSON.stringify({ latitude: coords.latitude, longitude: coords.longitude, city: '', country: '', museum: '' })
              : undefined,
            sessionId: visitId,
            sessionTitle: DEFAULT_VISIT_TITLE,
            sequenceNumber: 0,
          });
          const liveItem = reconcilePlaceholderWithSavedArtwork(placeholder, persistedItem);
          if (visitId) {
            const now = Date.now();
            appendVisitMessages(visitId, [
              { id: `capture-${placeholder.id}`, role: 'user', text: '', type: 'artwork_capture', artworkId: persistedItem.artworkId!, createdAt: now },
              { id: `card-${placeholder.id}`, role: 'model', text: '', type: 'artwork_card', artworkId: persistedItem.artworkId!, createdAt: now + 1 },
            ]);
          }

          if (isLibraryOnlyUpload) {
            showToast(collectionUploadSuccessMessage, 'success');
          }

          if (coords.latitude !== undefined && coords.longitude !== undefined) {
            resolveMuseum(coords.latitude, coords.longitude)
              .then(({ city, country, museum }) => {
                const resolved = JSON.stringify({ latitude: coords.latitude, longitude: coords.longitude, city, country, museum });
                updateSavedArtworkInState(persistedItem.id, { location: resolved });
              })
              .catch(() => {});
          }

          const analysis = await analyzeArtworkFromExisting(persistedItem.artworkId!, {});
          applyArtworkAnalysisResult(persistedItem.id, analysis, {
            sessionLinks: buildSessionLink(
              visitId,
              analysis.session_title || liveItem.sessionTitle || DEFAULT_VISIT_TITLE,
              0,
              mode === 'camera' ? 'camera' : 'upload',
            ),
            sessionTitle: analysis.session_title || liveItem.sessionTitle,
          });
          if (analysis.artist_name && analysis.artist_name !== 'Unknown Artist') {
            prefetchExploreDataWithContext(base64, analysis.artist_name, analysis.artwork_name);
          }
          if (analysis.artwork_id && analysis.artist_name && analysis.artist_name !== 'Unknown Artist') {
            fetchAndPersistInsights(analysis.artwork_id).then(insights => {
              if (insights.length > 0) {
                updateSavedArtworkInState(persistedItem.id, { insights });
              }
            }).catch(() => {});
          }
          if (visitId && analysis.artist_name && analysis.artist_name !== 'Unknown Artist') {
            const sessionItems = items
              .map((entry) => (
                entry.id === placeholder.id || entry.id === persistedItem.id
                  ? { ...entry, ...liveItem }
                  : entry
              ))
              .filter(i => itemBelongsToSession(i, visitId));
            const history = visitStreams[visitId] || [];
            triggerUploadCommentary(visitId, [{
              ...liveItem,
              artistName: analysis.artist_name,
              artworkName: analysis.artwork_name,
              description: parseAnalysis(analysis.description),
              date: analysis.date,
              medium: analysis.medium,
              keywords: analysis.tags,
              isAnalyzing: false,
            }], sessionItems, history);
          }
          setIsAnalyzing(false);
        } catch (error) {
          console.error('Upload failed:', error);
          if (placeholder) {
            removeUploadPlaceholder(placeholder.id);
          }
          setIsAnalyzing(false);
        }
      } else {
        setIsAnalyzing(true);
        const analyzedArtworks: {
          artistName?: string;
          artworkName?: string;
          description?: string;
          date?: string;
          medium?: string;
          keywords?: string[];
        }[] = [];
        const analyzedItems: GalleryItem[] = [];

        const memoryFiles = await Promise.all(files.map(async (file) => {
          const metadata = await readExifMetadata(file);
          const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target?.result as string);
            reader.readAsDataURL(file);
          });
          return { name: file.name, base64, metadata };
        }));

        const anchorMeta = memoryFiles[0].metadata;
        const { visitId: batchVisitId, isNew } = isLibraryOnlyUpload
          ? { visitId: undefined, isNew: false }
          : resolveUploadSession();

        if (isNew && batchVisitId) {
          const now = Date.now();
          const newVisit: VisitDraft = {
            id: batchVisitId,
            title: DEFAULT_VISIT_TITLE,
            createdAt: now,
            updatedAt: now,
          };
          setVisitDrafts(prev => [newVisit, ...prev.filter(v => v.id !== batchVisitId)]);
        }

        if (batchVisitId) {
          setVisit(prev => ({ ...prev, id: batchVisitId, itemIds: [], globalConversation: [] }));
        }

        const placeholders = memoryFiles.map((memFile, index) => {
          const itemTime = memFile.metadata.timestamp || Date.now();
          const itemTimeLabel = new Date(itemTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          return createLocalUploadPlaceholder({
            previewUrl: memFile.base64,
            mode,
            timestamp: itemTime,
            photoTime: itemTimeLabel,
            location: memFile.metadata.latitude
              ? JSON.stringify({
                  latitude: memFile.metadata.latitude,
                  longitude: memFile.metadata.longitude,
                  city: '',
                  country: '',
                  museum: '',
                })
              : undefined,
            sessionId: batchVisitId,
            sessionTitle: DEFAULT_VISIT_TITLE,
            sequenceNumber: index,
          });
        });

        if (placeholders.length > 0) {
          setItems(prev => [...placeholders, ...prev]);
          if (batchVisitId) {
            setVisit(prev => ({ ...prev, itemIds: [...prev.itemIds, ...placeholders.map((item) => item.id)] }));
          }
        }

        const persistedUploads: Array<{ item: GalleryItem; placeholder: GalleryItem; file: File; base64: string; metadata: { latitude?: number; longitude?: number; timestamp?: number } }> = [];

        for (let index = 0; index < memoryFiles.length; index++) {
          const memFile = memoryFiles[index];
          const placeholder = placeholders[index];
          const itemTime = memFile.metadata.timestamp || Date.now();
          const itemTimeLabel = new Date(itemTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          const locationString = memFile.metadata.latitude
            ? JSON.stringify({
                latitude: memFile.metadata.latitude,
                longitude: memFile.metadata.longitude,
                city: '',
                country: '',
                museum: '',
              })
            : undefined;
          try {
            const persistedItem = await persistRawArtwork({
              file: base64ToFile(memFile.base64, memFile.name),
              previewUrl: memFile.base64,
              mode,
              timestamp: itemTime,
              photoTime: itemTimeLabel,
              coords: { latitude: memFile.metadata.latitude, longitude: memFile.metadata.longitude },
              location: locationString,
              sessionId: batchVisitId,
              sessionTitle: DEFAULT_VISIT_TITLE,
              sequenceNumber: index,
            });
            const liveItem = reconcilePlaceholderWithSavedArtwork(placeholder, persistedItem);
            persistedUploads.push({
              item: liveItem,
              placeholder,
              file: base64ToFile(memFile.base64, memFile.name),
              base64: memFile.base64,
              metadata: memFile.metadata,
            });
          } catch (error) {
            console.error('Failed to save artwork before analysis:', error);
            removeUploadPlaceholder(placeholder.id);
          }
        }

        const persistedItems = persistedUploads.map((entry) => entry.item);
        if (persistedItems.length > 0) {
          if (batchVisitId) {
            const now = Date.now();
            appendVisitMessages(
              batchVisitId,
              persistedUploads.flatMap((entry, index) => ([
                { id: `capture-${entry.placeholder.id}`, role: 'user', text: '', type: 'artwork_capture', artworkId: entry.item.artworkId!, createdAt: now + (index * 2) },
                { id: `card-${entry.placeholder.id}`, role: 'model', text: '', type: 'artwork_card', artworkId: entry.item.artworkId!, createdAt: now + (index * 2) + 1 },
              ])),
            );
          }
          if (isLibraryOnlyUpload) {
            showToast(
              persistedItems.length === 1
                ? 'Added an artwork to collection'
                : `Added ${persistedItems.length} artworks to collection`,
              'success',
            );
          }
        }

        if (anchorMeta.latitude !== undefined && anchorMeta.longitude !== undefined) {
          resolveMuseum(anchorMeta.latitude, anchorMeta.longitude)
            .then(({ city, country, museum }) => {
              const resolved = JSON.stringify({ latitude: anchorMeta.latitude, longitude: anchorMeta.longitude, city, country, museum });
              resolvedLocation.current = resolved;
              setItems(prev => prev.map(item => persistedUploads.some(p => p.item.id === item.id) ? { ...item, location: resolved } : item));
            })
            .catch(() => {});
        }

        for (const entry of persistedUploads) {
          try {
            const analysis = await analyzeArtworkFromExisting(entry.item.artworkId!);
            applyArtworkAnalysisResult(entry.item.id, analysis, {
              sessionLinks: buildSessionLink(
                batchVisitId,
                analysis.session_title || DEFAULT_VISIT_TITLE,
                entry.item.sessionLinks?.[0]?.sequenceNumber,
                mode === 'camera' ? 'camera' : 'upload',
              ),
              sessionTitle: batchVisitId ? analysis.session_title || DEFAULT_VISIT_TITLE : undefined,
            });
            if (analysis.artwork_id && analysis.artist_name && analysis.artist_name !== 'Unknown Artist') {
              fetchAndPersistInsights(analysis.artwork_id).then(insights => {
                if (insights.length > 0) {
                  updateSavedArtworkInState(entry.item.id, { insights });
                }
              }).catch(() => {});
            }
            if (analysis.artist_name && analysis.artist_name !== 'Unknown Artist') {
              const resolvedItem = {
                ...entry.item,
                artistName: analysis.artist_name,
                artworkName: analysis.artwork_name,
                description: parseAnalysis(analysis.description),
                date: analysis.date,
                medium: analysis.medium,
                keywords: analysis.tags,
                isAnalyzing: false,
              };
              analyzedArtworks.push(resolvedItem);
              analyzedItems.push(resolvedItem);
            }
          } catch (e) {
            const errMsg = (e as Error)?.message || '';
            markArtworkAnalysisFailed(entry.item.id, errMsg || 'Analysis failed.');
          }
        }

        if (batchVisitId && analyzedArtworks.length > 0) {
          const history = visitStreams[batchVisitId] || [];
          triggerUploadCommentary(batchVisitId, analyzedArtworks, analyzedItems, history);
        }
        if (batchVisitId && persistedItems.length >= 2) setFilteredVisitId(batchVisitId);
        setIsAnalyzing(false);
      }
    } finally {
      inFlightUploadKeysRef.current.delete(uploadKey);
      if (target) target.value = '';
    }
  };

  // Reset interpretation panel state when opening a new artwork
  useEffect(() => {
    setInterpretationRightMode('metadata');
  }, [interpretingItem?.id]);

  useEffect(() => {
    if (currentUser?.user_id) {
      getUserQuota(currentUser.user_id).then(setQuotaInfo).catch(() => {});
    }
  }, [currentUser?.user_id]);

  const handleNavigateInterpretation = (direction: 'prev' | 'next') => {
    if (!interpretingItem || !interpretingItem.allVisitItems || interpretingItem.allVisitItems.length <= 1) return;

    const allItems = interpretingItem.allVisitItems;
    const currentIndex = allItems.findIndex(i => i.id === interpretingItem.id);

    if (currentIndex === -1) return;

    let nextIndex: number;
    if (direction === 'next') {
      nextIndex = (currentIndex + 1) % allItems.length;
    } else {
      nextIndex = (currentIndex - 1 + allItems.length) % allItems.length;
    }

    const nextItem = allItems[nextIndex];
    setInterpretingItem({
      ...nextItem,
      allVisitItems: allItems
    });
    if (artworkDetailContext && window.history.state?.view === 'artwork') {
      window.history.replaceState(
        {
          view: 'artwork',
          artworkId: nextItem.id,
          artworkContext: artworkDetailContext,
          activeTab,
          collectTab,
        } satisfies NavigationHistoryState,
        '',
        artworkDetailContext.basePath
      );
    }
  };

  const handleDeleteItem = (id: string) => {
    setDeleteConfirmation({ id, type: 'item' });
  };

  const handleRetryAnalysis = async (item: GalleryItem) => {
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
        sessionTitle: analysis.session_title || item.sessionTitle,
        sessionLinks: item.sessionLinks,
      });
      if (analysis.artwork_id && analysis.artist_name && analysis.artist_name !== 'Unknown Artist') {
        fetchAndPersistInsights(analysis.artwork_id).then(insights => {
          if (insights.length > 0) updateSavedArtworkInState(itemId, { insights });
        }).catch(() => {});
      }
    } catch {
      markArtworkAnalysisFailed(itemId, 'Retry failed.');
    }
  };

  const handleRefreshAnalysis = async (overrides?: { artistName?: string; artworkName?: string; date?: string; medium?: string; keywords?: string[] }) => {
    if (!interpretingItem?.artworkId) return;
    const targetItem = interpretingItem;
    updateSavedArtworkInState(targetItem.id, {
      isAnalyzing: true,
      analysisStatus: 'analyzing',
      analysisError: undefined,
    });
    try {
      const result = await analyzeArtworkFromExisting(targetItem.artworkId, {
        artistName: overrides?.artistName,
        artworkName: overrides?.artworkName,
      });
      applyArtworkAnalysisResult(targetItem.id, result, {
        referenceUrls: result.reference_urls || [],
      });
      fetchAndPersistInsights(targetItem.artworkId).then(insights => {
        if (insights.length > 0) {
          updateSavedArtworkInState(targetItem.id, { insights });
        }
      }).catch(() => {});
    } catch (error) {
      console.error('Failed to refresh analysis:', error);
      markArtworkAnalysisFailed(targetItem.id, 'Refresh failed.');
      throw error;
    }
  };

  const confirmDeleteItem = async (id: string) => {
    try {
      const itemToDelete = items.find(item => item.id === id);
      if (itemToDelete?.artworkId) {
        await deleteArtwork(itemToDelete.artworkId, USER_ID);
      }
      setItems(prev => prev.filter(item => item.id !== id));
      if (interpretingItem?.id === id) setInterpretingItem(null);
      showToast('Artwork deleted', 'success');
      console.log(`Successfully deleted artwork: ${id}`);
    } catch (error) {
      console.error("Failed to delete artwork:", error);
    } finally {
      setDeleteConfirmation(null);
    }
  };

  const handleDeleteSession = (sessionId: string) => {
    setOpenVisitMenuId(null);
    setDeleteConfirmation({ id: sessionId, type: 'session' });
  };

  const handleStartRenameVisit = (visitId: string, currentTitle: string) => {
    setOpenVisitMenuId(null);
    setEditingVisitId(visitId);
    setEditingVisitTitle(currentTitle);
  };

  const saveVisitTitle = async (visitId: string, nextTitle: string) => {
    const trimmedTitle = nextTitle.trim() || DEFAULT_VISIT_TITLE;
    const currentSummary = visitSummaries.find(summary => summary.id === visitId);
    const isPersistedSession = persistedSessions.some((session) => session.id === visitId);

    if (!currentSummary || trimmedTitle === currentSummary.title) {
      return;
    }

    if (isPersistedSession) {
      await updateSession(visitId, sessionUserId, trimmedTitle);
      refreshPersistedSessions();
    }

    if (currentSummary.items.length > 0) {
      setItems(prev => prev.map(item => (
        itemBelongsToSession(item, visitId)
          ? updateSessionLinkForItem(item, visitId, (existing) => ({
              sessionId: visitId,
              sessionTitle: trimmedTitle,
              sequenceNumber: existing?.sequenceNumber,
              source: existing?.source,
              createdAt: existing?.createdAt,
            }))
          : item
      )));
    }

    setVisitDrafts(prev => {
      const now = Date.now();
      const existingDraft = prev.find(draft => draft.id === visitId);
      if (existingDraft) {
        return prev.map(draft =>
          draft.id === visitId ? { ...draft, title: trimmedTitle, updatedAt: now } : draft
        );
      }
      return [{ id: visitId, title: trimmedTitle, createdAt: now, updatedAt: now }, ...prev];
    });
  };

  const commitVisitRename = async (visitId: string) => {
    if (!visitSummaries.find(summary => summary.id === visitId)) {
      setEditingVisitId(null);
      setEditingVisitTitle('');
      return;
    }

    try {
      await saveVisitTitle(visitId, editingVisitTitle);
    } catch (error) {
      console.error('Failed to rename visit:', error);
      showToast('Could not rename session', 'info');
    } finally {
      setEditingVisitId(null);
      setEditingVisitTitle('');
    }
  };

  const removeVisitLocally = (sessionId: string) => {
    setItems(prev => prev.map(item => (
      itemBelongsToSession(item, sessionId)
        ? updateSessionLinkForItem(item, sessionId, () => null)
        : item
    )));
    setVisitDrafts(prev => prev.filter(draft => draft.id !== sessionId));
    setVisitStreams(prev => {
      const next = { ...prev };
      delete next[sessionId];
      return next;
    });
    setStreamingVisitResponses(prev => {
      const next = { ...prev };
      delete next[sessionId];
      return next;
    });
    setVisit(prev => prev.id === sessionId ? { ...prev, id: '', itemIds: [], globalConversation: [] } : prev);
    if (interpretingItem && itemBelongsToSession(interpretingItem, sessionId)) {
      setInterpretingItem(prev => prev ? updateSessionLinkForItem(prev, sessionId, () => null) : prev);
    }
    setFilteredVisitId(prev => (prev === sessionId ? null : prev));
  };

  const confirmDeleteSession = async (sessionId: string) => {
    try {
      try {
        await deleteSession(sessionId, sessionUserId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes('404')) {
          throw error;
        }
      }
      removeVisitLocally(sessionId);
      refreshPersistedSessions();
      showToast('Session deleted. Artworks stayed in your library.', 'success');
      console.log(`Successfully deleted session: ${sessionId}`);
    } catch (error) {
      console.error("Failed to delete session:", error);
      showToast('Could not delete session', 'info');
    } finally {
      setDeleteConfirmation(null);
    }
  };

  const recentVisitSummaries = useMemo(() => visitSummaries.slice(0, 10), [visitSummaries]);
  const sessionsLoading = !artworksLoaded && visitSummaries.length === 0;

  const topLevelNavigation: Array<{ id: AppTab; label: string; icon: React.ReactNode }> = [
    {
      id: 'newSession',
      label: 'New Session',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
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
          <circle cx="12" cy="8" r="4" /><path d="M20 21a8 8 0 0 0-16 0" />
        </svg>
      ),
    },
  ];
  if (SHOW_LEARN_TAB) {
    topLevelNavigation.push({
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

  const handleSwitchTopLevelTab = (tabId: AppTab) => {
    setActiveTab(tabId);
    setRecentsOpen(false);
    if (tabId === 'newSession') {
      setFilteredVisitId(null);
      setIsComposingNewSession(true);
      resetPreparedSessionState();
      setVisit({
        id: '',
        itemIds: [],
        globalConversation: [],
      });
    }
    setArtistPageContext(null);
    setMovementPageContext(null);
    setInterpretingItem(null);
    setArtworkDetailContext(null);
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  };

  const handleSelectVisitSummary = (summaryId: string) => {
    if (editingVisitId === summaryId) return;
    setActiveTab('newSession');
    setFilteredVisitId(summaryId);
    setIsComposingNewSession(false);
    resetPreparedSessionState();
    setArtistPageContext(null);
    setMovementPageContext(null);
    setInterpretingItem(null);
    setArtworkDetailContext(null);
    setOpenVisitMenuId(null);
    setRecentsOpen(false);
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  };

  const isTopLevelTabActive = (tabId: AppTab) =>
    tabId === 'newSession' ? isNewSessionEntryActive : activeTab === tabId;

  const sidebarNavItemSharedClassName =
    'h-11 rounded-2xl ring-1 ring-transparent transition-colors';
  const sidebarNavItemActiveClassName =
    'bg-[var(--color-bg-tertiary)] text-neutral-900 shadow-sm ring-neutral-200';
  const sidebarNavItemInactiveClassName =
    'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900';

  const getExpandedNavItemClassName = (isActive: boolean) =>
    `w-full flex items-center gap-3.5 px-3 text-[13px] font-medium text-left ${sidebarNavItemSharedClassName} ${
      isActive ? sidebarNavItemActiveClassName : sidebarNavItemInactiveClassName
    }`;

  const getCollapsedNavItemClassName = (isActive: boolean) =>
    `flex h-11 w-11 items-center justify-center ${sidebarNavItemSharedClassName} ${
      isActive ? sidebarNavItemActiveClassName : sidebarNavItemInactiveClassName
    }`;

  const renderVisitSummaryCard = (summary: VisitSummary) => (
    <div
      key={summary.id}
      className={`relative w-full rounded-[20px] p-1 ${
        activeVisitSummary?.id === summary.id && activeTab === 'newSession'
          ? 'bg-[var(--color-bg-tertiary)] text-neutral-900 shadow-sm ring-1 ring-neutral-200'
          : 'text-neutral-600 hover:bg-neutral-100/80 hover:text-neutral-900 font-medium'
      }`}
    >
      <button
        onClick={() => handleSelectVisitSummary(summary.id)}
        className="w-full rounded-[16px] px-4 py-2 pr-12 text-left"
      >
        <div className="flex min-w-0 flex-col gap-0.5">
          {editingVisitId === summary.id ? (
            <input
              ref={renameInputRef}
              value={editingVisitTitle}
              onChange={(event) => setEditingVisitTitle(event.target.value)}
              onBlur={() => void commitVisitRename(summary.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void commitVisitRename(summary.id);
                }
                if (event.key === 'Escape') {
                  setEditingVisitId(null);
                  setEditingVisitTitle('');
                }
              }}
              onClick={(event) => event.stopPropagation()}
              className="w-full rounded-md bg-white/90 px-2 py-1 text-[13px] leading-tight text-neutral-900 outline-none ring-1 ring-neutral-200 focus:ring-2 focus:ring-neutral-400"
            />
          ) : (
            <p className="truncate text-[13px] leading-tight">{summary.title}</p>
          )}
          <p
            className={`mt-1 truncate font-mono text-[10px] font-semibold leading-none tracking-wide ${
              activeVisitSummary?.id === summary.id && activeTab === 'newSession' ? 'text-neutral-500' : 'text-neutral-400/90'
            }`}
          >
            {summary.artworkCount} {summary.artworkCount === 1 ? 'artwork' : 'artworks'}
          </p>
        </div>
      </button>
      {editingVisitId !== summary.id && (
        <DropdownMenu
          open={openVisitMenuId === summary.id}
          onOpenChange={(open) => setOpenVisitMenuId(open ? summary.id : null)}
        >
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
              className={`absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full transition-colors ${
                activeVisitSummary?.id === summary.id && activeTab === 'newSession'
                  ? 'text-neutral-500 hover:bg-white hover:text-neutral-900'
                  : 'text-neutral-400 hover:bg-white/80 hover:text-neutral-700'
              }`}
              aria-label={`Open actions for ${summary.title}`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx="5" cy="12" r="1.7" />
                <circle cx="12" cy="12" r="1.7" />
                <circle cx="19" cy="12" r="1.7" />
              </svg>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            sideOffset={6}
            className="min-w-[170px]"
            onCloseAutoFocus={(event) => event.preventDefault()}
          >
            <DropdownMenuItem
              className="gap-2 font-medium"
              onSelect={(event) => {
                event.preventDefault();
                setOpenVisitMenuId(null);
                handleStartRenameVisit(summary.id, summary.title);
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
              <span>Rename session</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              destructive
              className="gap-2 font-medium"
              onSelect={(event) => {
                event.preventDefault();
                setOpenVisitMenuId(null);
                handleDeleteSession(summary.id);
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
              <span>Delete session</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );

  const artworkHeaderActions = interpretingItem?.artworkId ? (
    <ArtworkActionsMenu
      disabled={Boolean(interpretingItem.isAnalyzing)}
      onEdit={!interpretingItem.isAnalyzing ? () => setArtworkHeaderEditToken(token => token + 1) : undefined}
      onDelete={() => setDeleteConfirmation({ type: 'item', id: interpretingItem.id })}
      buttonClassName="flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-200/50 hover:text-neutral-900 active:text-neutral-900"
      iconClassName="h-[18px] w-[18px]"
    />
  ) : null;

  const headerMenuButton = window.innerWidth < 768 && !sidebarOpen ? (
    <button
      onClick={() => {
        setSidebarOpen(true);
      }}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-700 shadow-sm transition-colors hover:bg-neutral-50"
      title="Open menu"
      aria-label="Open menu"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <line x1="4" y1="7" x2="20" y2="7" />
        <line x1="4" y1="12" x2="20" y2="12" />
        <line x1="4" y1="17" x2="20" y2="17" />
      </svg>
    </button>
  ) : null;

  const collectionFloatingMenuButton = window.innerWidth < 768 && !sidebarOpen ? (
    <button
      onClick={() => {
        setSidebarOpen(true);
      }}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-700 shadow-sm transition-colors hover:bg-neutral-50"
      title="Open menu"
      aria-label="Open menu"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <line x1="4" y1="7" x2="20" y2="7" />
        <line x1="4" y1="12" x2="20" y2="12" />
        <line x1="4" y1="17" x2="20" y2="17" />
      </svg>
    </button>
  ) : null;



  const isGalleryEmpty = items.length === 0 && !isAnalyzing;

  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || 'YOUR_GOOGLE_CLIENT_ID';

  const isVisitMode = activeTab === 'newSession' && (isComposingNewSession || !!filteredVisitId);
  const isNewSessionEntryActive = activeTab === 'newSession' && isComposingNewSession;
  const userAvatar = currentUser?.profile_picture_url ? (
    <img
      src={currentUser.profile_picture_url}
      alt={currentUser.username || 'User avatar'}
      className="h-full w-full rounded-full object-cover"
    />
  ) : (
    <div className="flex h-full w-full items-center justify-center rounded-full bg-white text-[12px] font-bold text-neutral-900">
      {currentUser ? currentUser.username[0] : 'U'}
    </div>
  );

  return (
    <GoogleOAuthProvider clientId={googleClientId}>
      <div
        className="relative flex h-dvh w-screen flex-row overflow-hidden bg-[var(--color-bg-primary)] text-neutral-900"
      >
        <Toaster />

        <Suspense fallback={null}>
          <UnsortedClassificationModal
            open={isUnsortedFlowOpen}
            items={items}
            onClose={() => setIsUnsortedFlowOpen(false)}
            onClassify={handleUpdateClassification}
          />
        </Suspense>

        <AddFromLibraryModal
          open={isLibraryPickerOpen}
          items={availableLibraryArtworks}
          selectedIds={pendingLibraryArtworkIds}
          searchValue={libraryPickerSearch}
          onClose={() => {
            setIsLibraryPickerOpen(false);
            setLibraryPickerSearch('');
          }}
          onSearchChange={setLibraryPickerSearch}
          onToggleSelect={stageLibraryArtworkForSession}
          onConfirm={() => setIsLibraryPickerOpen(false)}
        />

        {showLoginModal && !currentUser && (
          <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-6">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowLoginModal(false)} />
            <div className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
              <h3 className="text-lg font-bold text-neutral-900 mb-2">Sign in to Musee</h3>
              <p className="mb-6 text-[13px] leading-relaxed text-neutral-500">
                Sign in to save your collections, view your aesthetic taste profile, and access your artwork analysis history.
              </p>
              <div className="flex justify-center">
                <GoogleLogin
                  onLoginSuccess={(user) => {
                    handleLoginSuccess(user);
                    setShowLoginModal(false);
                  }}
                  onLoginError={() => alert('Login Error')}
                />
              </div>
            </div>
          </div>
        )}

        {showAccountModal && (
          <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-6">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowAccountModal(null)} />
            <div className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4">
                <h2 className="text-[15px] font-semibold text-neutral-900">
                  {showAccountModal === 'account' ? 'Account settings' : 'Personalization'}
                </h2>
                <button
                  onClick={() => setShowAccountModal(null)}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-base text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                >
                  ✕
                </button>
              </div>

              {showAccountModal === 'account' ? (
                <div className="flex flex-col gap-5 px-5 py-5">
                  <div>
                    <label className="text-[11px] font-medium text-neutral-400">Display name</label>
                    <div className="mt-1.5 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-[14px] text-neutral-900">
                      {currentUser?.full_name || '—'}
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-neutral-400">Username</label>
                    <div className="mt-1.5 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-[14px] text-neutral-900">
                      {currentUser?.full_name?.toLowerCase().replace(/\s+/g, '') || '—'}
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-neutral-400">Email</label>
                    <div className="mt-1.5 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-[14px] text-neutral-500">
                      {currentUser?.email || '—'}
                    </div>
                  </div>
                  <div className="border-t border-neutral-100 pt-4">
                    <label className="text-[11px] font-medium text-neutral-400">Plan</label>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-[13px] capitalize text-neutral-700">{quotaInfo?.tier ?? 'free'}</span>
                      <span className="text-[11px] text-neutral-400">
                        {quotaInfo
                          ? quotaInfo.limit === null
                            ? `${quotaInfo.used} artworks (unlimited)`
                            : `${quotaInfo.used} / ${quotaInfo.limit} artworks`
                          : '…'}
                      </span>
                    </div>
                    {quotaInfo && quotaInfo.limit !== null && (
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.min(100, (quotaInfo.used / quotaInfo.limit) * 100)}%`,
                            backgroundColor:
                              quotaInfo.used >= quotaInfo.limit
                                ? '#ef4444'
                                : quotaInfo.used / quotaInfo.limit > 0.8
                                  ? '#f59e0b'
                                  : '#a3a3a3',
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-5 px-5 py-5">
                  <div>
                    <label className="text-[11px] font-medium text-neutral-400">Gallery theme</label>
                    <select className="mt-1.5 w-full appearance-none rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-[14px] text-neutral-600 outline-none">
                      <option value="">Minimal (default)</option>
                      <option value="warm">Warm</option>
                      <option value="dark">Dark</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-neutral-400">Card density</label>
                    <select className="mt-1.5 w-full appearance-none rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-[14px] text-neutral-600 outline-none">
                      <option value="">Comfortable (default)</option>
                      <option value="compact">Compact</option>
                      <option value="spacious">Spacious</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-neutral-400">Analysis language</label>
                    <select
                      value={language}
                      onChange={(event) => {
                        const nextLanguage = event.target.value;
                        setLanguage(nextLanguage);
                        localStorage.setItem('musee_language', nextLanguage);
                      }}
                      className="mt-1.5 w-full appearance-none rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-[14px] text-neutral-600 outline-none"
                    >
                      <option value="en">English</option>
                      <option value="zh">中文</option>
                    </select>
                  </div>
                  {currentUser && (
                    <button
                      onClick={handleLogout}
                      className="rounded-xl border border-neutral-200 px-3 py-2.5 text-left text-[14px] text-neutral-700 transition-colors hover:bg-neutral-50"
                    >
                      Sign out
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {sidebarCollapsed && (
          <aside className="hidden md:flex md:w-[72px] shrink-0 flex-col border-r border-neutral-200 bg-[var(--color-bg-secondary)]">
            <div className="flex h-[52px] flex-col items-center border-b border-neutral-200 px-3">
              <button
                onClick={() => setSidebarCollapsed(false)}
                className="group relative flex h-full w-full items-center justify-center overflow-hidden rounded-[16px] border border-transparent text-neutral-800 transition-colors hover:bg-neutral-50"
                title="Expand sidebar"
                aria-label="Expand sidebar"
              >
                <span className="text-[24px] font-bold tracking-[0.22em] transition-all duration-200 group-hover:translate-y-2 group-hover:opacity-0">
                  M
                </span>
                <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-all duration-200 group-hover:opacity-100">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <line x1="9" y1="3" x2="9" y2="21" />
                    <path d="M13 9l3 3-3 3" />
                  </svg>
                </span>
              </button>
            </div>

            <div className="flex flex-col items-center gap-2 px-3 py-4">
              {topLevelNavigation.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => handleSwitchTopLevelTab(tab.id)}
                  className={getCollapsedNavItemClassName(isTopLevelTabActive(tab.id))}
                  title={tab.label}
                  aria-label={tab.label}
                >
                  {tab.icon}
                </button>
              ))}

              <DropdownMenu open={recentsOpen} onOpenChange={setRecentsOpen}>
                <DropdownMenuTrigger asChild>
                  <button
                    className={getCollapsedNavItemClassName(recentsOpen)}
                    title="Recent sessions"
                    aria-label="Recent sessions"
                  >
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  side="right"
                  align="start"
                  sideOffset={12}
                  className="w-[340px] overflow-visible rounded-[24px] p-2"
                >
                  <div className="px-3 py-2">
                    <p className="text-[16px] font-semibold text-neutral-900">Recents</p>
                  </div>
                  <div className="max-h-[min(70vh,560px)] space-y-2 overflow-y-auto px-1 pb-1">
                    {sessionsLoading ? (
                      <SessionListSkeleton compact={true} />
                    ) : recentVisitSummaries.length > 0 ? (
                      recentVisitSummaries.map((summary) => renderVisitSummaryCard(summary))
                    ) : (
                      <div className="px-3 py-4 text-[12px] text-neutral-400">No recent sessions yet.</div>
                    )}
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="mt-auto p-3 relative">
              <button
                onClick={() => setUserMenuOpen(prev => !prev)}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-neutral-200 bg-white text-[12px] font-bold text-neutral-900 shadow-sm transition-colors hover:bg-neutral-50"
              >
                {userAvatar}
              </button>

              {userMenuOpen && (
                <>
                  <div className="fixed inset-0 z-[var(--z-floating-backdrop)]" onClick={() => setUserMenuOpen(false)} />
                  <div className="absolute bottom-3 left-full z-[var(--z-floating)] ml-3 w-[240px] rounded-2xl border border-neutral-200 bg-white p-4 shadow-xl">
                    <div>
                      <label className="text-[10px] font-medium text-neutral-400">Language</label>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="mt-1.5 flex w-full items-center justify-between rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-left text-xs text-neutral-700 transition-colors hover:border-neutral-300">
                          <span>{language === 'zh' ? '中文' : 'English'}</span>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="mr-0.5 text-neutral-400">
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-0">
                        <DropdownMenuRadioGroup
                          value={language}
                          onValueChange={(nextLanguage) => {
                            setLanguage(nextLanguage);
                            localStorage.setItem('musee_language', nextLanguage);
                            setUserMenuOpen(false);
                          }}
                        >
                          <DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem>
                          <DropdownMenuRadioItem value="zh">中文</DropdownMenuRadioItem>
                        </DropdownMenuRadioGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    </div>
                    <div className="mt-4 space-y-2">
                      {currentUser && (
                        <button
                          onClick={() => {
                            setUserMenuOpen(false);
                            setShowAccountModal('account');
                          }}
                          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-neutral-700 transition-all hover:bg-neutral-50"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                          </svg>
                          <span>Settings</span>
                        </button>
                      )}
                      {currentUser ? (
                        <button
                          onClick={() => {
                            setUserMenuOpen(false);
                            handleLogout();
                          }}
                          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-red-500 transition-all hover:bg-red-50"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                          </svg>
                          <span>Sign out</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setUserMenuOpen(false);
                            setShowLoginModal(true);
                          }}
                          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-neutral-700 transition-all hover:bg-neutral-50"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>
                          </svg>
                          <span>Sign in</span>
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </aside>
        )}

        {/* Global unified sidebar */}
        <aside
          className={`shrink-0 z-[var(--z-drawer)] md:z-auto overflow-hidden border-r border-neutral-200 bg-[var(--color-bg-secondary)] transition-all duration-300 flex flex-col h-full ${
            sidebarOpen
              ? 'fixed inset-y-0 left-0 w-[260px] translate-x-0 shadow-[0_18px_60px_rgba(0,0,0,0.12)] md:shadow-none md:relative md:inset-auto md:translate-x-0'
              : 'fixed inset-y-0 left-0 w-[260px] -translate-x-full md:translate-x-0 md:relative md:inset-auto'
          } ${sidebarCollapsed ? 'md:hidden' : 'md:w-[260px] md:opacity-100'}`}
        >
          {/* Brand & Collapse Row */}
          <div className="flex h-[52px] items-center justify-between border-b border-neutral-200 px-5 shrink-0">
            <h1 className="text-[14px] font-bold tracking-[0.04em] text-neutral-800">Musee</h1>
            <button
              onClick={() => {
                if (window.innerWidth < 768) {
                  setSidebarOpen(false);
                } else {
                  setSidebarCollapsed(true);
                }
              }}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-500 transition-colors hover:text-neutral-900"
              title="Collapse sidebar"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="9" y1="3" x2="9" y2="21" />
                <path d="M16 15l-3-3 3-3" />
              </svg>
            </button>
          </div>

          {/* Top Navigation Links */}
          <div className="flex flex-col gap-1 px-3 py-4 shrink-0">
            {topLevelNavigation.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleSwitchTopLevelTab(tab.id)}
                className={getExpandedNavItemClassName(isTopLevelTabActive(tab.id))}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          <div className="h-px bg-neutral-200/60 my-1 mx-4" />

          {/* Search bar inside sidebar */}
          <div className="px-3 py-1.5 shrink-0">
            <div className="flex items-center gap-2.5 rounded-[16px] border border-neutral-200 bg-[var(--color-bg-tertiary)] px-3.5 py-2 text-neutral-700">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-neutral-400">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                value={visitSearch}
                onChange={(event) => setVisitSearch(event.target.value)}
                placeholder="Search sessions"
                className="w-full bg-transparent text-[12px] placeholder-neutral-400 outline-none font-medium"
              />
            </div>
          </div>

          {/* Sessions Scroll List */}
          <div className="relative z-10 flex-1 overflow-y-auto px-3 py-3 min-h-0 space-y-2 scrollbar-thin">
            {sessionsLoading ? (
              <SessionListSkeleton />
            ) : (
              visitSummaries.map((summary) => renderVisitSummaryCard(summary))
            )}
          </div>

          <div className="h-px bg-neutral-200/60 my-1 mx-4" />

          {/* User Profile Footer */}
          <div className={`relative shrink-0 p-3 ${userMenuOpen ? 'z-[var(--z-floating)]' : 'z-0'}`}>
            <button
              onClick={() => setUserMenuOpen(prev => !prev)}
              className="w-full flex items-center justify-between gap-3 pl-3.5 pr-4 py-2.5 rounded-xl border border-neutral-200 bg-white shadow-sm hover:bg-neutral-50 transition-colors text-left"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {/* Avatar */}
                <div className="h-6 w-6 shrink-0 overflow-hidden rounded-full border border-neutral-200 shadow-sm">
                  {userAvatar}
                </div>
                {/* Username */}
                <span className="text-[13px] font-semibold text-neutral-800 truncate">
                  {currentUser ? currentUser.username : 'User'}
                </span>
              </div>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`text-neutral-400 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {/* Popover Settings Dropdown Menu */}
            {userMenuOpen && (
              <>
                <div className="fixed inset-0 z-[var(--z-floating-backdrop)]" onClick={() => setUserMenuOpen(false)} />
                <div className="absolute bottom-full left-3 right-3 mb-2 z-[var(--z-floating)] bg-white border border-neutral-200 rounded-2xl shadow-xl p-4 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
                  {/* Language Select */}
                  <div>
                    <label className="text-[10px] font-medium text-neutral-400">Language</label>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="mt-1.5 flex w-full items-center justify-between rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-left text-xs text-neutral-700 transition-colors hover:border-neutral-300">
                          <span>{language === 'zh' ? '中文' : 'English'}</span>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="mr-0.5 text-neutral-400">
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-0">
                        <DropdownMenuRadioGroup
                          value={language}
                          onValueChange={(nextLanguage) => {
                            setLanguage(nextLanguage);
                            localStorage.setItem('musee_language', nextLanguage);
                            setUserMenuOpen(false);
                          }}
                        >
                          <DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem>
                          <DropdownMenuRadioItem value="zh">中文</DropdownMenuRadioItem>
                        </DropdownMenuRadioGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Settings (Account details) */}
                  {currentUser && (
                    <button
                      onClick={() => {
                        setUserMenuOpen(false);
                        setShowAccountModal('account');
                      }}
                      className="w-full text-left flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 rounded-xl transition-all"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                      </svg>
                      <span>Settings</span>
                    </button>
                  )}

                  {/* Sign out / Sign in */}
                  {currentUser ? (
                    <button
                      onClick={() => {
                        setUserMenuOpen(false);
                        handleLogout();
                      }}
                      className="w-full text-left flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-red-500 hover:bg-red-50 rounded-xl transition-all"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                      </svg>
                      <span>Sign out</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setUserMenuOpen(false);
                        setShowLoginModal(true);
                      }}
                      className="w-full text-left flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 rounded-xl transition-all"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>
                      </svg>
                      <span>Sign in</span>
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </aside>

        {/* Backdrop for mobile drawer */}
        {sidebarOpen && (
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-[var(--z-drawer-backdrop)] bg-neutral-900/20 backdrop-blur-[1px] md:hidden animate-in fade-in duration-300"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Right-hand Canvas main container */}
        <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative">
          
          {/* Dynamic Content view wrapper */}
          <div className="flex-1 min-h-0 relative flex flex-col">
            {artistPageContext ? (
              <div className="flex h-full min-w-0 flex-1 flex-col bg-[var(--color-bg-primary)] animate-in fade-in duration-300">
                <Suspense fallback={<ScreenLoader label="Loading artist" />}>
                  <ArtistPage
                    artistEntityId={artistPageContext.artistEntityId}
                    artworkId={artistPageContext.artworkId}
                    artistName={artistPageContext.artistName}
                    parentLabel={artistPageContext.parentLabel}
                    userId={currentUser?.user_id || USER_ID}
                    leftSlot={headerMenuButton}
                    onClose={closeArtistDetail}
                    onOpenArtwork={(item) => {
                      openArtworkDetail(item, {
                        parentLabel: artistPageContext.artistName || artistPageContext.artistEntityId || 'Artist',
                        basePath: window.location.pathname,
                        returnToArtistContext: artistPageContext,
                      });
                    }}
                    onNavigateToIndex={artistPageContext.returnToArtworkId ? undefined : () => {
                      setArtistPageContext(null);
                      setActiveTab('collect');
                      setCollectTab('artists');
                      window.history.pushState(
                        {
                          view: 'root',
                          activeTab: 'collect',
                          collectTab: 'artists',
                        } satisfies NavigationHistoryState,
                        '',
                        '/artists'
                      );
                    }}
                    isInline={true}
                  />
                </Suspense>
              </div>
            ) : movementPageContext ? (
              <div className="flex h-full min-w-0 flex-1 flex-col bg-[var(--color-bg-primary)] animate-in fade-in duration-300">
                <Suspense fallback={<ScreenLoader label="Loading collection" />}>
                  <ArtMovementPage
                    collection={movementPageContext}
                    items={items}
                    leftSlot={headerMenuButton}
                    onClose={() => {
                      setMovementPageContext(null);
                      window.history.pushState(
                        buildRootHistoryState(activeTab, collectTab),
                        '',
                        stateToPath(activeTab, collectTab),
                      );
                    }}
                    onOpenArtwork={(item) => {
                      openArtworkDetail(item, {
                        parentLabel: movementPageContext.name,
                        basePath: window.location.pathname,
                      });
                    }}
                    isInline={true}
                  />
                </Suspense>
              </div>
            ) : activeTab === 'newSession' ? (
              activeVisitSummary ? (
                <ExploreSessionView
                  activeVisitSummary={activeVisitSummary}
                  activeVisitStream={activeVisitStream}
                  interpretingItem={interpretingItem}
                  artworkHeaderActions={artworkHeaderActions}
                  artworkHeaderEditToken={artworkHeaderEditToken}
                  artworkDetailContext={artworkDetailContext}
                  headerLeftSlot={headerMenuButton}
                  showSessionHeader={!isComposingNewSession}
                  interpretationRightMode={interpretationRightMode}
                  sessionGoalInput={sessionGoalInput}
                  sessionGoals={sessionGoals}
                  sessionGoalDismissed={sessionGoalDismissed}
                  streamingVisitResponse={streamingVisitResponses[activeVisitSummary.id]}
                  userId={currentUser?.user_id || USER_ID}
                  goalGalleryInputRef={goalGalleryInputRef}
                  goalCameraInputRef={goalCameraInputRef}
                  preparedSessionItems={pendingSessionArtworks.map((entry) => ({
                    id: entry.id,
                    previewUrl: entry.previewUrl,
                    label: entry.label,
                    sublabel: entry.sublabel,
                    kind: entry.kind,
                  }))}
                  preparedSessionMessage={newSessionDraftMessage}
                  isSubmittingPreparedSession={isSubmittingPreparedSession}
                  visitStreamScrollRef={visitStreamScrollRef}
                  visitStreamEndRef={visitStreamEndRef}
                  onCloseArtworkDetail={closeArtworkDetail}
                  onUpdateMetadata={updateItemMetadata}
                  onUpdateClassification={handleUpdateClassification}
                  onDeleteArtwork={(itemId) => setDeleteConfirmation({ type: 'item', id: itemId })}
                  onNavigateInterpretation={handleNavigateInterpretation}
                  onInterpretationRightModeChange={setInterpretationRightMode}
                  onRefreshAnalysis={handleRefreshAnalysis}
                  onOpenArtistFromInterpretation={(artistEntityId, artworkId, artistName) => {
                    if (!interpretingItem) return;
                    openArtistDetail({
                      artistEntityId,
                      artworkId,
                      artistName,
                      parentLabel: interpretingItem.artworkName || 'Untitled',
                      returnToArtworkId: interpretingItem.id,
                      returnToArtworkContext: artworkDetailContext || {
                        parentLabel: activeVisitSummary.title,
                        basePath: stateToPath(activeTab, collectTab),
                      },
                    });
                  }}
                  onOpenSessionFromInterpretation={handleSelectVisitSummary}
                  onSaveExistingGoal={(newGoal) => {
                    const sid = activeVisitSummary.id;
                    setSessionGoals(prev => ({ ...prev, [sid]: newGoal }));
                    ensureSessionRecord(sid)
                      .then(async (res) => {
                        await setSessionGoal(res?.session?.id || sid, newGoal);
                        refreshPersistedSessions();
                      })
                      .catch(() => {});
                  }}
                  onSaveSessionTitle={async (newTitle) => {
                    try {
                      await saveVisitTitle(activeVisitSummary.id, newTitle);
                    } catch (error) {
                      console.error('Failed to rename visit from session header:', error);
                      showToast('Could not rename session', 'info');
                    }
                  }}
                  onSessionGoalInputChange={setSessionGoalInput}
                  onSubmitGoal={(goal) => {
                    const sid = activeVisitSummary.id || createVisitDraft();
                    setSessionGoalInput('');
                    setSessionGoals(prev => ({ ...prev, [sid]: goal }));
                    setSessionGoalDismissed(prev => new Set([...prev, sid]));
                    ensureSessionRecord(sid)
                      .then(async (res) => {
                        await setSessionGoal(res?.session?.id || sid, goal);
                        refreshPersistedSessions();
                      })
                      .catch(() => {});
                  }}
                  onPreparedSessionMessageChange={setNewSessionDraftMessage}
                  onOpenLibraryPicker={() => setIsLibraryPickerOpen(true)}
                  onRemovePreparedSessionItem={removePendingSessionArtwork}
                  onSubmitPreparedSession={() => void submitPreparedSession()}
                  onFileUpload={handleFileUpload}
                  onOpenSessionArtwork={(item) =>
                    openArtworkDetail(
                      item,
                      { parentLabel: activeVisitSummary.title, basePath: stateToPath(activeTab, collectTab) },
                      activeVisitSummary.items,
                    )
                  }
                />
              ) : (
                <div className="relative flex flex-1 items-center justify-center bg-[var(--color-bg-primary)] px-6">
                  {headerMenuButton ? (
                    <div className="pointer-events-none absolute left-4 top-3 z-20 md:hidden">
                      <div className="pointer-events-auto">
                        {headerMenuButton}
                      </div>
                    </div>
                  ) : null}
                  <EmptyWall isVisitMode={false} />
                </div>
              )
            ) : activeTab === 'collect' ? (
              <Suspense fallback={<ScreenLoader label="Loading collection" />}>
                <CollectView
                  headerLeftSlot={headerMenuButton}
                  topLevelLeftSlot={collectionFloatingMenuButton}
                  onFileUpload={handleFileUpload}
                  items={items}
                  visit={visit}
                  filteredVisitId={filteredVisitId}
                  isAnalyzing={isAnalyzing}
                  likedIds={likedIds}
                  albums={albums}
                  boardsLoading={boardsLoading}
                  userId={currentUser?.user_id || USER_ID}
                  collectTab={collectTab}
                  interpretingItem={interpretingItem}
                  artworkDetailContext={artworkDetailContext}
                  artworkHeaderActions={artworkHeaderActions}
                  artworkHeaderEditToken={artworkHeaderEditToken}
                  interpretationRightMode={interpretationRightMode}
                  onCloseArtworkDetail={closeArtworkDetail}
                  onUpdateMetadata={updateItemMetadata}
                  onUpdateClassification={handleUpdateClassification}
                  onDeleteArtwork={(itemId) => setDeleteConfirmation({ type: 'item', id: itemId })}
                  onNavigateInterpretation={handleNavigateInterpretation}
                  onInterpretationRightModeChange={setInterpretationRightMode}
                  onRefreshAnalysis={handleRefreshAnalysis}
                  onNavigateToArtistFromInterpretation={(artistEntityId, artworkId, artistName) => {
                    if (!interpretingItem) return;
                    openArtistDetail({
                      artistEntityId,
                      artworkId,
                      artistName,
                      parentLabel: interpretingItem.artworkName || 'Untitled',
                      returnToArtworkId: interpretingItem.id,
                      returnToArtworkContext: artworkDetailContext || {
                        parentLabel: 'All Artworks',
                        basePath: stateToPath(activeTab, collectTab),
                      },
                    });
                  }}
                  onNavigateToSessionFromInterpretation={handleSelectVisitSummary}
                  onCollectTabChange={setCollectTab}
                  onCreateBoard={handleCreateAlbum}
                  onRenameBoard={handleRenameAlbum}
                  onDeleteBoard={handleDeleteAlbum}
                  onAddItemsToBoard={handleAddItemsToBoard}
                  onOpenArtist={(artistEntityId, artistName) => {
                    openArtistDetail({
                      artistEntityId,
                      artistName,
                      parentLabel: 'Artists',
                    });
                  }}
                  onOpenMovement={setMovementPageContext}
                  onInterpretArtwork={(item, context) => {
                    const basePath = stateToPath(activeTab, collectTab);
                    openArtworkDetail(item, {
                      parentLabel: context?.label || 'All Artworks',
                      basePath,
                    }, context?.items);
                  }}
                  onDeleteItem={handleDeleteItem}
                  onStartUnsortedFlow={() => setIsUnsortedFlowOpen(true)}
                />
              </Suspense>
            ) : activeTab === 'profile' ? (
              <div className="relative flex h-full min-w-0 flex-1 flex-col bg-[var(--color-bg-primary)] overflow-hidden animate-in fade-in duration-300">
                {headerMenuButton ? (
                  <div className="pointer-events-none absolute left-4 top-3 z-20 md:hidden">
                    <div className="pointer-events-auto">
                      {headerMenuButton}
                    </div>
                  </div>
                ) : null}
                <div className="flex-1 overflow-y-auto">
                  <Suspense fallback={<ScreenLoader label="Loading profile" />}>
                    <TasteProfileView
                      userId={currentUser?.user_id || USER_ID}
                      refreshKey={profileRefreshKey}
                      onStartUnsortedFlow={() => setIsUnsortedFlowOpen(true)}
                    />
                  </Suspense>
                </div>
              </div>
            ) : activeTab === 'learn' ? (
              <div className="flex-1 overflow-hidden bg-[var(--color-bg-primary)] pt-16 md:pt-0">
                <Suspense fallback={<ScreenLoader label="Loading library" />}>
                  <LearningHubPage inline={true} initialGuide={learningInitialGuide} leftSlot={headerMenuButton} />
                </Suspense>
              </div>
            ) : null}
          </div>

        {interpretingItem && activeTab !== 'newSession' && activeTab !== 'collect' && (
          <InterpretationModal
            item={interpretingItem}
            onClose={closeArtworkDetail}
            onUpdateMetadata={updateItemMetadata}
            onUpdateClassification={handleUpdateClassification}
            onDelete={() => setDeleteConfirmation({ type: 'item', id: interpretingItem.id })}
            allVisitItems={interpretingItem.allVisitItems}
            onNavigate={handleNavigateInterpretation}
            rightMode={interpretationRightMode}
            onRightModeChange={setInterpretationRightMode}
            onRefreshAnalysis={handleRefreshAnalysis}
            userId={currentUser?.user_id || USER_ID}
            onNavigateToArtist={(artistEntityId, artworkId, artistName) => {
              openArtistDetail({
                artistEntityId,
                artworkId,
                artistName,
                parentLabel: interpretingItem.artworkName || 'Untitled',
                returnToArtworkId: interpretingItem.id,
                returnToArtworkContext: artworkDetailContext || {
                  parentLabel: stateToPath(activeTab, collectTab),
                  basePath: stateToPath(activeTab, collectTab),
                },
              });
            }}
            onNavigateToSession={handleSelectVisitSummary}
            navigationContextLabel={artworkDetailContext?.parentLabel || 'Artwork Set'}
          />
        )}

        {deleteConfirmation && (
          <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-6">
            <div className="absolute inset-0 bg-neutral-900/60 backdrop-blur-sm" onClick={() => setDeleteConfirmation(null)} />
            <div className="relative w-full max-w-md rounded-[2rem] bg-white p-10 shadow-2xl">
              <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#171717" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </div>
              <h3 className="mb-3 text-xl font-serif text-neutral-900">
                {deleteConfirmation.type === 'item' ? 'Remove Artwork?' : 'Delete Session?'}
              </h3>
              <p className="mb-8 text-sm leading-relaxed text-neutral-500">
                {deleteConfirmation.type === 'item'
                  ? 'This will permanently remove this artwork and its curated analysis from your Musee.'
                  : `This will permanently delete ${pendingDeleteVisitSummary?.title || 'this session'} and its reflections from Musee. The ${pendingDeleteVisitSummary?.artworkCount || 0} ${pendingDeleteVisitSummary?.artworkCount === 1 ? 'artwork will stay' : 'artworks will stay'} in your library.`}
              </p>
              <div className="flex space-x-3">
                <button
                  onClick={() => setDeleteConfirmation(null)}
                  className="flex-1 rounded-full px-6 py-3 text-[12px] font-semibold text-neutral-500 transition-colors hover:bg-neutral-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (deleteConfirmation.type === 'item') confirmDeleteItem(deleteConfirmation.id);
                    else confirmDeleteSession(deleteConfirmation.id);
                  }}
                  className="flex-1 rounded-full bg-neutral-900 px-6 py-3 text-[12px] font-semibold text-white transition-colors hover:bg-black"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'newSession' && !interpretingItem && !(
          activeVisitSummary &&
          activeVisitStream.length === 0 &&
          !sessionGoalDismissed.has(activeVisitSummary.id)
        ) && (
          <ContextualActionBar
            mode="session"
            onUpload={handleFileUpload}
            isAnalyzing={isAnalyzing}
            onInquiry={handleVisitInquiry}
            onLike={() => interpretingItem && handleToggleLike(interpretingItem.id)}
            isLiked={Boolean(interpretingItem && likedIds.has(interpretingItem.id))}
            onDelete={() => interpretingItem && setDeleteConfirmation({ type: 'item', id: interpretingItem.id })}
            onCollect={() => {}}
            onCommunity={() => setInterpretationRightMode((mode) => (mode === 'community' ? 'metadata' : 'community'))}
            isCommunityActive={interpretationRightMode === 'community'}
            activeItem={interpretingItem as unknown as GalleryItem || undefined}
            placeholder={activeVisitSummary ? 'Add a reflection, memory, or association...' : 'Start a visit or capture an artwork...'}
          />
        )}
      </main>



      </div>
    </GoogleOAuthProvider>
  );
};

export default App;
