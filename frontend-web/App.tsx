import React, { useState, useRef, useMemo, useEffect } from 'react';
import ExifReader from 'exifreader';
import { GalleryItem, NeighborItem, Message, Visit, TagCoordinate, Annotation, CuratorConversation, Album, AestheticVibe } from './types';
import { GoogleOAuthProvider } from '@react-oauth/google';
import GoogleLogin from './components/GoogleLogin';
import {
  analyzeArtworkStream,
  analyzeArtwork,
  ArtworkAnalysisResult,
  StreamingMetrics,
  getOrCreateUserId,
  fetchUserArtworks,
  resolveImageUrl,
  deleteSession,
  base64ToFile,
  getCurrentUser,
  logout,
  deleteArtwork,
  prefetchExploreDataWithContext,
  reanalyzeArtwork,
} from './apiService';
import GalleryCard from './components/GalleryCard';
import VisitStack from './components/VisitStack';
import InterpretationModal from './components/InterpretationModal';
import CuratorRoom from './components/CuratorRoom';
import ExhibitionHallView from './components/ExhibitionHallView';
import EmptyWall from './components/EmptyWall';
import UnderstandView from './components/UnderstandView';
import OrganizeView from './components/OrganizeView';
import TopographyView from './components/TopographyView';
import ArtSkillsView from './components/ArtSkillsView';
import TasteProfileView from './components/TasteProfileView';
import Toast, { ToastAction } from './components/Toast';
import ContextualActionBar from './components/ContextualActionBar';

// Helper to report metrics (can integrate with @vercel/speed-insights or custom analytics)
const reportStreamingMetrics = (metrics: StreamingMetrics) => {
  console.log('=== Streaming Analysis Metrics ===');
  console.log(`Request ID: ${metrics.request_id}`);
  console.log(`Model: ${metrics.model}`);
  console.log(`Image Processing: ${metrics.timings.image_processing_ms}ms`);
  console.log(`Time to AI Call: ${metrics.timings.time_to_ai_call_ms}ms`);
  console.log(`Time to First Chunk: ${metrics.timings.time_to_first_chunk_ms}ms`);
  console.log(`AI First Chunk Latency: ${metrics.timings.ai_first_chunk_latency_ms}ms`);
  console.log(`Streaming Duration: ${metrics.timings.streaming_duration_ms}ms`);
  console.log(`Total Duration: ${metrics.timings.total_duration_ms}ms`);
  console.log('==================================');

  // If @vercel/speed-insights is installed, report custom metrics:
  // import { track } from '@vercel/speed-insights';
  // track('artwork-analysis', {
  //   ttfc: metrics.timings.time_to_first_chunk_ms,
  //   total: metrics.timings.total_duration_ms,
  //   model: metrics.model
  // });

  // Or send to Google Analytics if available
  if (typeof window !== 'undefined' && (window as any).gtag) {
    (window as any).gtag('event', 'artwork_analysis_timing', {
      event_category: 'performance',
      time_to_first_chunk: metrics.timings.time_to_first_chunk_ms,
      total_duration: metrics.timings.total_duration_ms,
      model: metrics.model
    });
  }
};

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
        annotations: [{ id: 'az1', x: 50, y: 50, comment: "Pure void.", author: "Silent_Eye" }]
      },
      {
        id: 'z2', url: 'https://picsum.photos/id/231/800/1200',
        conversation: [],
        annotations: []
      },
      {
        id: 'z3', url: 'https://picsum.photos/id/232/800/1200',
        conversation: [],
        annotations: []
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
        annotations: [{ id: 'ab1', x: 30, y: 60, comment: "The weight is the truth.", author: "Concrete_Heart" }]
      },
      {
        id: 'b2', url: 'https://picsum.photos/id/235/800/1200',
        conversation: [],
        annotations: []
      },
      {
        id: 'b3', url: 'https://picsum.photos/id/236/800/1200',
        conversation: [],
        annotations: []
      }
    ]
  },
];

// Persistent user ID for the current browser session
const USER_ID = getOrCreateUserId();

const App: React.FC = () => {
  const albumInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [tagPositions, setTagPositions] = useState<Record<string, TagCoordinate>>({});
  const [activeTab, setActiveTab] = useState<'explore' | 'learn' | 'collect'>('explore');
  const [learnSubTab, setLearnSubTab] = useState<'curator' | 'taste-map' | 'skills' | 'profile'>('curator');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showEntrance, setShowEntrance] = useState(false);
  const [interpretingItem, setInterpretingItem] = useState<{
    url: string,
    id: string,
    conversation: Message[],
    annotations: Annotation[],
    artistName?: string,
    artworkName?: string,
    description?: string,
    keywords: string[],
    date?: string,
    medium?: string,
    artworkId?: string,
    isAnalyzing?: boolean,
    streamingText?: string,
    visitId?: string,
    allVisitItems?: GalleryItem[],
    is_liked?: boolean,
    vibe: AestheticVibe,
    timestamp: number,
    photoTime?: string,
    location?: string,
  } | null>(null);
  const [curatorRoomContext, setCuratorRoomContext] = useState<{ items: GalleryItem[], visitId?: string, initialMessage?: string } | null>(null);

  // Curator conversation history — persisted to localStorage
  const [curatorConversations, setCuratorConversations] = useState<CuratorConversation[]>(() => {
    try { return JSON.parse(localStorage.getItem('musee_curator_conversations') || '[]'); }
    catch { return []; }
  });
  const [exhibitionInput, setExhibitionInput] = useState('');
  const [exhibitionInputFocused, setExhibitionInputFocused] = useState(false);
  const exhibitionInputRef = useRef<HTMLInputElement>(null);
  const [galleryEdges, setGalleryEdges] = useState({ hasPrev: false, hasNext: false });
  const [activeThumbIndex, setActiveThumbIndex] = useState(0);
  const thumbStripRef = useRef<HTMLDivElement>(null);
  const galleryEntryRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(getCurrentUser());
  const [filteredVisitId, setFilteredVisitId] = useState<string | null>(null);
  const locationCache = useRef<Map<string, { city: string, country: string, museum: string }>>(new Map());
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ id: string, type: 'item' | 'session' } | null>(null);
  const [toast, setToast] = useState<{ message: string, type: 'info' | 'success', action?: ToastAction } | null>(null);

  const showToast = (message: string, type: 'info' | 'success' = 'info', action?: ToastAction) => {
    setToast({ message, type, action });
  };

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

    // 1. Context-Aware Priority: If inside an Exhibition Hall, always use that visitId.
    if (contextVisitId) {
      const visitItems = items.filter(i => i.visitId === contextVisitId);
      return { 
        visitId: contextVisitId, 
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
      const candidates = items.filter(i => i.visitId);
      
      for (const item of candidates) {
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
        return { visitId: item.visitId!, museumName: itemLoc.museum || item.sessionTitle };
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
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 640);
  const [language, setLanguage] = useState(localStorage.getItem('musee_language') || 'en');

  const [likedIds, setLikedIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('musee_liked_ids') || '[]')); }
    catch { return new Set(); }
  });

  const [albums, setAlbums] = useState<Album[]>(() => {
    try { return JSON.parse(localStorage.getItem('musee_albums') || '[]'); }
    catch { return []; }
  });

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

  const handleSaveToAlbums = (itemId: string, albumIds: string[]) => {
    setAlbums(prev => {
      const next = prev.map(album => {
        const shouldBeIn = albumIds.includes(album.id);
        const isIn = album.itemIds.includes(itemId);
        if (shouldBeIn && !isIn) return { ...album, itemIds: [...album.itemIds, itemId] };
        if (!shouldBeIn && isIn) return { ...album, itemIds: album.itemIds.filter(id => id !== itemId) };
        return album;
      });
      localStorage.setItem('musee_albums', JSON.stringify(next));
      return next;
    });
  };

  const handleCreateAlbum = (name: string, itemId: string) => {
    const newAlbum: Album = { id: Date.now().toString(), name, itemIds: [itemId] };
    setAlbums(prev => {
      const next = [...prev, newAlbum];
      localStorage.setItem('musee_albums', JSON.stringify(next));
      return next;
    });
  };

  const handleOpenCurator = () => {
    setCuratorRoomContext({ items: items.slice(0, 10) });
  };

  const [artworkChatMessage, setArtworkChatMessage] = useState<string | null>(null);
  const [interpretationRightMode, setInterpretationRightMode] = useState<'metadata' | 'chat'>('metadata');
  const [interpretationAskExpanded, setInterpretationAskExpanded] = useState(false);
  const [interpretingMode, setInterpretingMode] = useState<'professional' | 'interactive'>(
    () => (localStorage.getItem('musee_analysis_mode') as 'professional' | 'interactive') ?? 'professional'
  );

  const handleInquiry = (text: string) => {
    if (interpretingItem) {
      setArtworkChatMessage(text);
    } else if (filteredVisitId) {
      const visitItems = items.filter(i => i.visitId === filteredVisitId);
      setCuratorRoomContext({ items: visitItems, visitId: filteredVisitId, initialMessage: text });
    } else {
      setCuratorRoomContext({ items: items.slice(0, 10), initialMessage: text });
    }
  };

  const [visit, setVisit] = useState<Visit>({
    id: 'initial-' + Math.random().toString(36).substring(7),
    itemIds: [],
    globalConversation: []
  });

  // Fetch previous artworks on mount
  useEffect(() => {
    const loadArtworks = async () => {
      try {
        console.log('Fetching previous artworks for user:', USER_ID);
        const data = await fetchUserArtworks(USER_ID);

        if (data && data.items) {
          // Map each artwork to the frontend GalleryItem type
          const mappedItems: GalleryItem[] = data.items.map((item: any) => {
            // Resolve image URL
            const imageUrl = resolveImageUrl(item.photo_uri);

            // Map keywords from tags
            const keywords = (item.artwork_tags || []).map((t: any) =>
              t.name.startsWith('#') ? t.name.toLowerCase() : `#${t.name.toLowerCase()}`
            );

            return {
              id: item.id,
              artworkId: item.id,
              url: imageUrl,
              artistName: item.artist_name,
              artworkName: item.artwork_name,
              description: parseAnalysis(item.analysis),
              keywords: keywords,
              date: item.date,
              medium: item.medium,
              timestamp: item.photo_time ? new Date(item.photo_time).getTime() : (item.created_at ? new Date(item.created_at).getTime() : Date.now()),
              visitId: item.session_id,
              location: item.location && typeof item.location === 'object' ? JSON.stringify(item.location) : item.location,
              photoTime: item.photo_time,
              sessionTitle: item.session_title,
              movement: item.movement,
              periodBucket: item.period_bucket,
              referenceUrls: item.reference_urls || [],
              conversation: (item.conversation_history || []).map((msg: any) => ({
                role: msg.role === 'assistant' ? 'model' : 'user',
                text: msg.content
              })),
              annotations: [],
              vibe: {
                backgroundColor: '#ffffff',
                padding: 4,
                borderRadius: '12px',
                borderType: 'solid',
                accentColor: '#000000'
              }
            };
          });

          console.log(`Loaded ${mappedItems.length} artworks from history`);
          setItems(mappedItems);

          // Update tag positions for topography view
          const newTagPositions = { ...tagPositions };
          let changed = false;
          mappedItems.forEach(item => {
            item.keywords.forEach(tag => {
              if (!newTagPositions[tag]) {
                newTagPositions[tag] = {
                  x: (Math.random() * 2 - 1),
                  y: (Math.random() * 2 - 1)
                };
                changed = true;
              }
            });
          });
          if (changed) setTagPositions(newTagPositions);
        }
      } catch (error) {
        console.error('Failed to load previous artworks:', error);
      }
    };

    loadArtworks();
  }, []);

  const scrollRef = useRef<HTMLDivElement>(null);
  const resolvedLocation = useRef<string | undefined>(undefined);

  // The filtered view of artworks for "The Corridor"
  const corridorItems = useMemo(() => {
    if (filteredVisitId) return items.filter(i => i.visitId === filteredVisitId);
    return items;
  }, [items, filteredVisitId]);

  const corridorEntries = useMemo(() => {
    // If inside "The Salon" (filteredVisitId), just show individual items
    if (filteredVisitId) return corridorItems.map(item => ({ type: 'item' as const, item }));

    const entries: Array<{ type: 'item', item: GalleryItem } | { type: 'stack', items: GalleryItem[], visitId: string }> = [];
    const visitGroups = new Map<string, GalleryItem[]>();
    const orderOfVisits: string[] = [];

    corridorItems.forEach(item => {
      if (item.visitId) {
        if (!visitGroups.has(item.visitId)) {
          visitGroups.set(item.visitId, []);
          orderOfVisits.push(item.visitId);
        }
        visitGroups.get(item.visitId)!.push(item);
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

  const parseDisplayLocation = (loc: any): string | null => {
    if (!loc) return null;
    try {
      const data = typeof loc === 'object' ? loc : (typeof loc === 'string' && loc.startsWith('{') ? JSON.parse(loc) : null);
      if (data) {
        const parts: string[] = [];
        if (data.museum) parts.push(data.museum);
        if (data.city) parts.push(data.city);
        else if (data.country) parts.push(data.country);
        return parts.join(', ') || null;
      }
      return typeof loc === 'string' ? loc : null;
    } catch { return typeof loc === 'string' ? loc : null; }
  };

  const parseDisplayDate = (dateStr: string): string => {
    try {
      const dt = new Date(dateStr);
      if (!isNaN(dt.getTime())) return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      return dateStr;
    } catch { return dateStr; }
  };

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
    const visitItems = items.filter(i => i.visitId === visitId);
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

  useEffect(() => {
    if (!scrollRef.current || activeTab !== 'explore') return;
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

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
    mode: 'gallery' | 'camera' = 'camera'
  ) => {
    const target = event.target as HTMLInputElement;
    const files = Array.from(target.files || []);
    if (files.length === 0) return;

    // Single file upload: Open modal immediately and stream analysis
    if (files.length === 1) {
      const file = files[0];
      const metadata = mode === 'gallery' ? await readExifMetadata(file) : { latitude: undefined, longitude: undefined, timestamp: undefined };
      
      // Fallback to active GPS if camera mode and no EXIF
      let coords = { latitude: metadata.latitude, longitude: metadata.longitude };
      if (mode === 'camera' && coords.latitude === undefined) {
        const current = await getCurrentLocation().catch(() => undefined);
        if (current) coords = current;
      }

      const photoTimestamp = metadata.timestamp || Date.now();
      const photoTime = new Date(photoTimestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      
      setIsAnalyzing(true);

      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        const { visitId, isNew } = await autoDetermineVisit({
          lat: coords?.latitude,
          lng: coords?.longitude,
          exifTime: photoTimestamp,
          contextVisitId: filteredVisitId
        });

        const newItemId = Math.random().toString(36).substring(2, 11);
        const placeholderItem: GalleryItem = {
          id: newItemId,
          url: base64,
          keywords: [],
          vibe: { backgroundColor: '#ffffff', padding: 4, borderRadius: '12px', borderType: 'solid', accentColor: '#000000' },
          timestamp: photoTimestamp,
          conversation: [],
          annotations: [],
          visitId: visitId,
          isAnalyzing: true,
          streamingText: '',
          location: coords ? JSON.stringify({ latitude: coords.latitude, longitude: coords.longitude, city: '', country: '', museum: '' }) : undefined,
          photoTime: photoTime
        };

        setItems(prev => [placeholderItem, ...prev]);
        setVisit(prev => ({ ...prev, itemIds: [...prev.itemIds, newItemId] }));

        if (coords.latitude !== undefined && coords.longitude !== undefined) {
          resolveMuseum(coords.latitude, coords.longitude).then(({ city, country, museum }) => {
            const resolved = JSON.stringify({ latitude: coords.latitude, longitude: coords.longitude, city, country, museum });
            setItems(prev => prev.map(item => item.id === newItemId ? { ...item, location: resolved } : item));
            const contextName = museum || city || 'your collection';
            if (isNew) showToast(`Created a new visit for ${contextName}`, 'success');
            else showToast(`Added to ${contextName} collection`, 'info');
          }).catch(() => showToast(isNew ? 'Created a new visit' : 'Added to collection'));
        } else {
          showToast(isNew ? 'Created a new visit' : 'Added to collection');
        }

        setInterpretingItem({
          ...placeholderItem,
          visitId: visitId,
          allVisitItems: items.filter(i => i.visitId === visitId).concat([placeholderItem]),
          streamingText: ''
        });

        // Prefetch skills with artist context as soon as it appears in the stream (~2-5s in)
        const exploreContextFired = { current: false };

        const safeFile = base64ToFile(base64, file.name);
        await analyzeArtworkStream(
          safeFile, USER_ID,
          (chunk) => setInterpretingItem(prev => {
            if (!prev || prev.id !== newItemId) return prev;
            const newText = (prev.streamingText || '') + chunk;
            if (!exploreContextFired.current) {
              const jsonStart = newText.indexOf('{');
              if (jsonStart !== -1) {
                const json = newText.substring(jsonStart);
                const artistMatch = json.match(/"artist"\s*:\s*"((?:[^"\\]|\\.)*)"/);
                const titleMatch  = json.match(/"title"\s*:\s*"((?:[^"\\]|\\.)*)"/);
                if (artistMatch) {
                  exploreContextFired.current = true;
                  prefetchExploreDataWithContext(base64, artistMatch[1], titleMatch?.[1]);
                }
              }
            }
            return { ...prev, streamingText: newText };
          }),
          (analysis) => {
            const keywords = analysis.tags.map((tag: string) => tag.startsWith('#') ? tag.toLowerCase() : `#${tag.toLowerCase()}`);
            setTagPositions(prev => {
              const updated = { ...prev };
              keywords.forEach((tag: string) => { if (!updated[tag]) updated[tag] = { x: (Math.random() * 2 - 1), y: (Math.random() * 2 - 1) }; });
              return updated;
            });
            const updates = {
              keywords, artistName: analysis.artist_name, artworkName: analysis.artwork_name,
              description: parseAnalysis(analysis.description), date: analysis.date, medium: analysis.medium,
              artworkId: analysis.artwork_id, isAnalyzing: false, streamingText: undefined,
              location: analysis.location && typeof analysis.location === 'object' ? JSON.stringify(analysis.location) : analysis.location,
              photoTime: analysis.photo_time,
              referenceUrls: analysis.reference_urls || [],
            };
            setItems(prev => prev.map(item => item.id === newItemId ? { ...item, ...updates } : item));
            setInterpretingItem(prev => (prev && prev.id === newItemId) ? { ...prev, ...updates } : prev);
            setIsAnalyzing(false);
          },
          (error) => {
            const msg = error?.message || 'Analysis failed.';
            setItems(prev => prev.map(item => item.id === newItemId ? { ...item, isAnalyzing: false, streamingText: msg } : item));
            setInterpretingItem(prev => (prev && prev.id === newItemId) ? { ...prev, isAnalyzing: false, streamingText: msg } : prev);
            setIsAnalyzing(false);
          },
          visitId, undefined, undefined, photoTime, coords?.latitude, coords?.longitude
        );
      } catch (error) { console.error('Upload failed:', error); }
    } 
    // Batch Upload
    else {
      setIsAnalyzing(true);
      let finishedCount = 0;

      const memoryFiles = await Promise.all(files.map(async (file) => {
        const metadata = await readExifMetadata(file);
        const base64 = await new Promise<string>(r => { const reader = new FileReader(); reader.onload = e => r(e.target?.result as string); reader.readAsDataURL(file); });
        return { name: file.name, base64, metadata };
      }));

      // Determine the session anchor (first file's metadata)
      const anchorMeta = memoryFiles[0].metadata;
      const anchorTime = anchorMeta.timestamp || Date.now();
      const anchorTimeLabel = new Date(anchorTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

      const { visitId: batchVisitId } = await autoDetermineVisit({ 
        isBatch: true, 
        contextVisitId: filteredVisitId,
        exifTime: anchorTime,
        lat: anchorMeta.latitude,
        lng: anchorMeta.longitude
      });
      
      setVisit(prev => ({ ...prev, id: batchVisitId, itemIds: [], globalConversation: [] }));

      const batchPlaceholders: GalleryItem[] = memoryFiles.map(memFile => {
        const id = Math.random().toString(36).substring(2, 11);
        (memFile as any).generatedId = id;
        const itemTime = memFile.metadata.timestamp || Date.now();
        const itemTimeLabel = new Date(itemTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

        return {
          id: id, url: memFile.base64, keywords: [], conversation: [], annotations: [], visitId: batchVisitId,
          vibe: { backgroundColor: '#ffffff', padding: 4, borderRadius: '12px', borderType: 'solid', accentColor: '#000000' },
          timestamp: itemTime, isAnalyzing: true, streamingText: '', photoTime: itemTimeLabel,
          location: memFile.metadata.latitude ? JSON.stringify({ 
            latitude: memFile.metadata.latitude, 
            longitude: memFile.metadata.longitude, 
            city: '', country: '', museum: '' 
          }) : undefined
        };
      });

      setItems(prev => [...batchPlaceholders, ...prev]);
      setVisit(prev => ({ ...prev, itemIds: [...prev.itemIds, ...batchPlaceholders.map(p => p.id)] }));

      if (anchorMeta.latitude !== undefined && anchorMeta.longitude !== undefined) {
        resolveMuseum(anchorMeta.latitude, anchorMeta.longitude).then(({ city, country, museum }) => {
          const resolved = JSON.stringify({ latitude: anchorMeta.latitude, longitude: anchorMeta.longitude, city, country, museum });
          resolvedLocation.current = resolved;
          setItems(prev => prev.map(item => batchPlaceholders.some(p => p.id === item.id) ? { ...item, location: resolved } : item));
          showToast(`Started a new visit at ${museum || city || 'museum'} with ${batchPlaceholders.length} works`, 'success');
        }).catch(() => showToast(`Started a new visit with ${batchPlaceholders.length} works`, 'success'));
      } else {
        showToast(`Started a new visit with ${batchPlaceholders.length} works`, 'success');
      }

      for (const memFile of memoryFiles) {
        const newItemId = (memFile as any).generatedId;
        const itemTimeLabel = new Date(memFile.metadata.timestamp || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

        try {
          const safeFile = base64ToFile(memFile.base64, memFile.name);
          const analysis = await analyzeArtwork(
            safeFile, USER_ID, undefined, batchVisitId, 
            resolvedLocation.current, itemTimeLabel, 
            memFile.metadata?.latitude, memFile.metadata?.longitude
          );
          const keywords = analysis.tags.map((tag: string) => tag.startsWith('#') ? tag.toLowerCase() : `#${tag.toLowerCase()}`);
          const updates = {
            keywords, artistName: analysis.artist_name, artworkName: analysis.artwork_name,
            description: parseAnalysis(analysis.description), date: analysis.date, medium: analysis.medium,
            sessionTitle: analysis.session_title, artworkId: analysis.artwork_id, isAnalyzing: false,
            location: analysis.location && typeof analysis.location === 'object' ? JSON.stringify(analysis.location) : analysis.location,
            photoTime: analysis.photo_time,
            referenceUrls: analysis.reference_urls || [],
          };
          setItems(prev => prev.map(item => item.id === newItemId ? { ...item, ...updates } : item));
        } catch (e) {
          setItems(prev => prev.map(item => item.id === newItemId ? { ...item, isAnalyzing: false, description: 'Analysis failed.' } : item));
        } finally {
          finishedCount++;
          if (finishedCount === memoryFiles.length) setIsAnalyzing(false);
        }
      }
      if (batchPlaceholders.length >= 2) setFilteredVisitId(batchVisitId);
    }
    if (target) target.value = '';
  };

  // Reset interpretation panel state when opening a new artwork
  useEffect(() => {
    setInterpretationRightMode('metadata');
    setInterpretationAskExpanded(false);
    setArtworkChatMessage(null);
  }, [interpretingItem?.id]);

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
  };

  const updateItemConversation = (id: string, newMessages: Message[]) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, conversation: [...item.conversation, ...newMessages] } : item));
  };

  const updateItemMetadata = (id: string, updates: { artistName?: string; artworkName?: string; date?: string; medium?: string; keywords?: string[] }) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
    setInterpretingItem(prev => prev?.id === id ? { ...prev, ...updates } : prev);
  };

  const handleDeleteItem = (id: string) => {
    setDeleteConfirmation({ id, type: 'item' });
  };

  const handleRetryHarder = async () => {
    if (!interpretingItem || isAnalyzing) return;
    const retryItem = interpretingItem;

    // Run in background — keep current results visible; only update on success
    // Pass the image URL directly; backend loads/compresses it server-side
    await analyzeArtworkStream(
      null, USER_ID,
      () => {}, // ignore streaming chunks
      (analysis) => {
        const keywords = analysis.tags.map((tag: string) => tag.startsWith('#') ? tag.toLowerCase() : `#${tag.toLowerCase()}`);
        const updates = {
          keywords, artistName: analysis.artist_name, artworkName: analysis.artwork_name,
          description: parseAnalysis(analysis.description), date: analysis.date, medium: analysis.medium,
          artworkId: analysis.artwork_id || retryItem.artworkId,
          referenceUrls: analysis.reference_urls || [],
        };
        setItems(prev => prev.map(item => item.id === retryItem.id ? { ...item, ...updates } : item));
        setInterpretingItem(prev => (prev && prev.id === retryItem.id) ? { ...prev, ...updates } : prev);
      },
      (error) => { console.error('Retry harder failed:', error); },
      retryItem.visitId, undefined, undefined, retryItem.photoTime,
      undefined, undefined, 'high', retryItem.url
    );
  };

  const handleReanalyze = async () => {
    if (!interpretingItem?.artworkId) return;
    const targetItem = interpretingItem;
    const result = await reanalyzeArtwork(targetItem.artworkId);
    const keywords = (result.tags || []).map((tag: string) => tag.startsWith('#') ? tag.toLowerCase() : `#${tag.toLowerCase()}`);
    const updates = {
      artistName: result.artist_name,
      artworkName: result.artwork_name,
      description: parseAnalysis(result.analysis),
      date: result.date,
      medium: result.medium,
      keywords,
      referenceUrls: result.reference_urls || [],
    };
    setItems(prev => prev.map(item => item.id === targetItem.id ? { ...item, ...updates } : item));
    setInterpretingItem(prev => prev?.id === targetItem.id ? { ...prev, ...updates } : prev);
  };

  const confirmDeleteItem = async (id: string) => {
    try {
      const itemToDelete = items.find(item => item.id === id);
      if (itemToDelete?.artworkId) {
        await deleteArtwork(itemToDelete.artworkId);
      }
      setItems(prev => prev.filter(item => item.id !== id));
      if (interpretingItem?.id === id) setInterpretingItem(null);
      console.log(`Successfully deleted artwork: ${id}`);
    } catch (error) {
      console.error("Failed to delete artwork:", error);
    } finally {
      setDeleteConfirmation(null);
    }
  };

  const handleDeleteSession = (sessionId: string) => {
    setDeleteConfirmation({ id: sessionId, type: 'session' });
  };

  const confirmDeleteSession = async (sessionId: string) => {
    try {
      await deleteSession(sessionId);
      setItems(prev => prev.filter(item => item.visitId !== sessionId));
      if (interpretingItem && interpretingItem.visitId === sessionId) {
        setInterpretingItem(null);
      }
      console.log(`Successfully deleted session: ${sessionId}`);
    } catch (error) {
      console.error("Failed to delete session:", error);
    } finally {
      setDeleteConfirmation(null);
    }
  };



  const isGalleryEmpty = items.length === 0 && !isAnalyzing;

  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || 'YOUR_GOOGLE_CLIENT_ID';

  const isVisitMode = !!filteredVisitId;

  // ── Visit mode theme — change these to restyle the immersive visit look ──
  const visitTheme = {
    bg: '#1a1a1a',
    text: 'text-white',
  } as const;

  return (
    <GoogleOAuthProvider clientId={googleClientId}>
      <div
        className={`relative w-screen h-dvh overflow-hidden flex flex-col transition-colors duration-700 ${isVisitMode ? visitTheme.text : ''}`}
        style={{ backgroundColor: isVisitMode ? visitTheme.bg : '#ffffff' }}
      >
        {/* Toast Notifier (Phase 7) */}
        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            action={toast.action}
            onClose={() => setToast(null)}
          />
        )}

        {/* Bottom-left user panel */}
        {!filteredVisitId && (
          <div className="fixed bottom-4 left-4 z-50">
            {currentUser ? (
              <div className="relative">
                {/* Avatar trigger */}
                <button
                  onClick={() => setShowUserMenu(v => !v)}
                  className="w-9 h-9 rounded-full overflow-hidden border-2 border-white/30 shadow-lg hover:scale-105 active:scale-95 transition-all"
                >
                  <img src={currentUser.profile_picture_url} alt={currentUser.full_name} className="w-full h-full object-cover" />
                </button>

                {/* Dropdown */}
                {showUserMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                    <div className="absolute bottom-full left-0 mb-2 w-72 bg-white border border-neutral-200 rounded-2xl shadow-xl overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
                      {/* User header */}
                      <div className="px-4 pt-4 pb-3">
                        <div className="flex items-center gap-3">
                          <img src={currentUser.profile_picture_url} alt={currentUser.full_name} className="w-9 h-9 rounded-full object-cover shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-semibold text-neutral-900 truncate leading-tight">{currentUser.full_name}</p>
                            <p className="text-[11px] text-neutral-400 truncate leading-tight mt-0.5">{currentUser.email}</p>
                          </div>
                          <span className="text-[10px] bg-neutral-100 text-neutral-500 px-2 py-0.5 rounded-md font-semibold shrink-0">Free</span>
                        </div>
                        {(() => {
                          const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
                          const todayCount = items.filter(i => i.timestamp >= todayStart.getTime()).length;
                          const pct = Math.min(todayCount / 60, 1);
                          return (
                            <div className="mt-3 text-center">
                              <div className="h-1 bg-neutral-100 rounded-full overflow-hidden">
                                <div className="h-full bg-neutral-900 rounded-full transition-all" style={{ width: `${pct * 100}%` }} />
                              </div>
                              <p className="text-[11px] text-neutral-400 mt-1.5">{todayCount}/60 analyses today</p>
                            </div>
                          );
                        })()}
                      </div>

                      <div className="h-px bg-neutral-100 mx-3" />

                      {/* Language row */}
                      <div className="px-4 py-3 flex items-center justify-between">
                        <span className="text-[13px] text-neutral-600">Language</span>
                        <div className="flex bg-neutral-100 rounded-full p-0.5 gap-0.5">
                          <button
                            onClick={() => { setLanguage('en'); localStorage.setItem('musee_language', 'en'); }}
                            className={`px-3 py-1 rounded-full text-[11px] font-medium transition-all ${language === 'en' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-400 hover:text-neutral-700'}`}
                          >EN</button>
                          <button
                            onClick={() => { setLanguage('zh'); localStorage.setItem('musee_language', 'zh'); }}
                            className={`px-3 py-1 rounded-full text-[11px] font-medium transition-all ${language === 'zh' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-400 hover:text-neutral-700'}`}
                          >中文</button>
                        </div>
                      </div>

                      <div className="h-px bg-neutral-100 mx-3" />

                      {/* Menu items */}
                      <div className="py-1.5">
                        {[
                          {
                            label: 'Account Settings',
                            icon: <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/>,
                            action: () => { setShowUserMenu(false); setShowAccountModal('account'); },
                            extra: <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                          },
                          {
                            label: 'Personalization',
                            icon: <path d="M12 20h9"/>,
                            action: () => { setShowUserMenu(false); setShowAccountModal('personalization'); },
                            extra: <><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></>
                          },
                          {
                            label: 'Give feedback',
                            icon: <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></>,
                            action: () => setShowUserMenu(false),
                            extra: null
                          },
                          {
                            label: 'Terms and Privacy',
                            icon: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></>,
                            action: () => { setShowUserMenu(false); window.open('/terms.html', '_blank'); },
                            extra: null
                          },
                        ].map(({ label, icon, extra, action }) => (
                          <button key={label} onClick={action} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50 transition-colors text-left" style={{ cursor: 'pointer' }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-400 shrink-0">
                              {icon}{extra}
                            </svg>
                            <span className="text-[13px] text-neutral-700">{label}</span>
                          </button>
                        ))}
                      </div>

                      <div className="h-px bg-neutral-100 mx-3" />

                      {/* Log out */}
                      <div className="py-1.5">
                        <button
                          onClick={() => { setShowUserMenu(false); handleLogout(); }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50 transition-colors text-left"
                          style={{ cursor: 'pointer' }}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-400 shrink-0">
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                          </svg>
                          <span className="text-[13px] text-neutral-700">Log out</span>
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="relative">
                {/* Anonymous icon — indicates not signed in */}
                <button
                  onClick={() => setShowLoginModal(v => !v)}
                  title="Sign in"
                  className="w-9 h-9 rounded-full bg-neutral-100 border border-neutral-200 shadow-lg flex items-center justify-center text-neutral-400 hover:text-neutral-600 hover:bg-neutral-200 active:scale-95 transition-all"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                </button>
                {/* Sign-in popover */}
                {showLoginModal && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowLoginModal(false)} />
                    <div className="absolute bottom-full left-0 mb-2 z-50 bg-white border border-neutral-200 rounded-2xl shadow-xl p-4 w-64 animate-in fade-in slide-in-from-bottom-2 duration-150">
                      <p className="text-[12px] text-neutral-500 mb-3 leading-relaxed">Sign in to save your collection and analysis history.</p>
                      <div className="flex justify-center">
                      <GoogleLogin
                        onLoginSuccess={(user) => { handleLoginSuccess(user); setShowLoginModal(false); }}
                        onLoginError={() => alert(`Login Error`)}
                      />
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Account Settings / Personalization Modal */}
        {showAccountModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowAccountModal(null)} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200 border border-neutral-200">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100">
                <h2 className="text-[15px] font-semibold text-neutral-900">{showAccountModal === 'account' ? 'Account settings' : 'Personalization'}</h2>
                <button onClick={() => setShowAccountModal(null)} className="w-7 h-7 flex items-center justify-center rounded-full text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 transition-colors text-base">✕</button>
              </div>

              {showAccountModal === 'account' ? (
                <div className="px-5 py-5 flex flex-col gap-5">
                  <div>
                    <label className="text-[10px] tracking-[0.2em] uppercase text-neutral-400 font-medium">Display name</label>
                    <div className="mt-1.5 w-full bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2.5 text-[14px] text-neutral-900">{currentUser?.full_name || '—'}</div>
                  </div>
                  <div>
                    <label className="text-[10px] tracking-[0.2em] uppercase text-neutral-400 font-medium">Username</label>
                    <div className="mt-1.5 w-full bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2.5 text-[14px] text-neutral-900">{currentUser?.full_name?.toLowerCase().replace(/\s+/g, '') || '—'}</div>
                  </div>
                  <div>
                    <label className="text-[10px] tracking-[0.2em] uppercase text-neutral-400 font-medium">Email</label>
                    <div className="mt-1.5 w-full bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2.5 text-[14px] text-neutral-500">{currentUser?.email || '—'}</div>
                  </div>
                  <div className="border-t border-neutral-100 pt-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] text-neutral-700">Keep analyses private</span>
                          <span className="text-[9px] bg-neutral-200 text-neutral-500 px-1.5 py-0.5 rounded-md font-semibold">Pro</span>
                        </div>
                        <p className="text-[11px] text-neutral-400 mt-0.5 leading-snug">Your gallery won't be visible to others</p>
                      </div>
                      <div className="w-10 h-6 bg-neutral-200 rounded-full relative shrink-0 opacity-50 cursor-not-allowed mt-0.5">
                        <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow-sm" />
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="px-5 py-5 flex flex-col gap-5">
                  <div>
                    <label className="text-[10px] tracking-[0.2em] uppercase text-neutral-400 font-medium">Gallery theme</label>
                    <select className="mt-1.5 w-full bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2.5 text-[14px] text-neutral-600 outline-none appearance-none">
                      <option value="">Minimal (default)</option>
                      <option value="warm">Warm</option>
                      <option value="dark">Dark</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] tracking-[0.2em] uppercase text-neutral-400 font-medium">Card density</label>
                    <select className="mt-1.5 w-full bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2.5 text-[14px] text-neutral-600 outline-none appearance-none">
                      <option value="">Comfortable (default)</option>
                      <option value="compact">Compact</option>
                      <option value="spacious">Spacious</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] tracking-[0.2em] uppercase text-neutral-400 font-medium">Analysis language</label>
                    <select className="mt-1.5 w-full bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2.5 text-[14px] text-neutral-600 outline-none appearance-none">
                      <option value="en">English</option>
                      <option value="zh">中文</option>
                    </select>
                  </div>
                  <p className="text-[11px] text-neutral-300 text-center">More personalization options coming soon</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Solid background strip behind top nav — height expands on taste-map to cover sub-tab bar */}
        <div
          className="fixed top-0 left-0 right-0 z-[65] bg-[#faf9f7] transition-all duration-300"
          style={{ height: 44 }}
        />

        {/* Top Tab Bar — Explore / Learn / Collect */}
        {!filteredVisitId && (
          <div
            className="fixed top-2 left-1/2 -translate-x-1/2 z-[70] flex items-center bg-white border border-neutral-200 rounded-full shadow-sm px-1 py-1"
            style={{ pointerEvents: 'auto' }}
          >
            {(['explore', 'learn', 'collect'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 sm:px-4 py-1 rounded-full text-[9px] sm:text-[10px] tracking-[0.15em] uppercase font-bold transition-all whitespace-nowrap ${
                  activeTab === tab
                    ? 'bg-neutral-900 text-white'
                    : 'text-neutral-400 hover:text-neutral-700'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        )}





        <div className={`relative z-10 flex-1 min-h-0 overflow-hidden transition-all duration-700 ease-in-out ${activeTab !== 'explore' ? 'pt-11' : 'pt-14 sm:pt-10 pb-20 sm:pb-4'} ${(interpretingItem || curatorRoomContext) ? 'opacity-40 blur-sm' : 'opacity-100'}`}>
          {activeTab === 'learn' ? (
            <div className="flex flex-col w-full h-full overflow-hidden">
              {/* Learn sub-tab bar */}
              <div className="shrink-0 flex items-end gap-7 px-5 sm:px-8 border-b border-neutral-100 relative z-[70] bg-[#faf9f7]">
                {(['curator', 'taste-map', 'skills', 'profile'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setLearnSubTab(tab)}
                    className={`pt-3 pb-3 text-[11px] sm:text-[12px] tracking-[0.14em] uppercase font-semibold border-b-2 transition-all -mb-px whitespace-nowrap ${
                      learnSubTab === tab
                        ? 'border-neutral-900 text-neutral-900'
                        : 'border-transparent text-neutral-400 hover:text-neutral-700'
                    }`}
                  >{tab === 'curator' ? 'Curator' : tab === 'taste-map' ? 'Taste Map' : tab === 'skills' ? 'Art Skills' : 'Profile'}</button>
                ))}
              </div>
              {/* Learn sub-tab content */}
              <div className="flex-1 min-h-0 overflow-hidden relative">
                {learnSubTab === 'curator' && (
                  <UnderstandView
                    items={items}
                    sidebarOpen={sidebarOpen}
                    onCloseSidebar={() => setSidebarOpen(false)}
                    onToggleSidebar={() => setSidebarOpen(p => !p)}
                    conversations={curatorConversations}
                    onSaveConversation={(convId, newMsgs, itemIds) => {
                      setCuratorConversations(prev => {
                        const existing = prev.find(c => c.id === convId);
                        const allMessages = existing ? [...existing.messages, ...newMsgs] : newMsgs;
                        const title = allMessages.find(m => m.role === 'user')?.text?.slice(0, 60) ?? 'Conversation';
                        const updated: CuratorConversation[] = existing
                          ? prev.map(c => c.id === convId ? { ...c, messages: allMessages, title, updatedAt: Date.now() } : c)
                          : [{ id: convId, title, messages: allMessages, itemIds, createdAt: Date.now(), updatedAt: Date.now() }, ...prev];
                        localStorage.setItem('musee_curator_conversations', JSON.stringify(updated));
                        return updated;
                      });
                    }}
                    onDeleteConversation={(id) => {
                      setCuratorConversations(prev => {
                        const updated = prev.filter(c => c.id !== id);
                        localStorage.setItem('musee_curator_conversations', JSON.stringify(updated));
                        return updated;
                      });
                    }}
                  />
                )}
                {learnSubTab === 'skills' && (
                  <ArtSkillsView />
                )}
                {learnSubTab === 'profile' && (
                  <TasteProfileView userId={currentUser?.user_id || USER_ID} />
                )}
              </div>
            </div>
          ) : activeTab === 'collect' ? (
            <OrganizeView
              items={items}
              visit={visit}
              filteredVisitId={filteredVisitId}
              isAnalyzing={isAnalyzing}
              likedIds={likedIds}
              albums={albums}
              userId={USER_ID}
              onInterpret={(item) => {
                const activeId = filteredVisitId;
                const sessionItems = activeId ? items.filter(i => i.visitId === activeId) : [item];
                setInterpretingItem({ ...item, visitId: item.visitId, allVisitItems: sessionItems });
              }}
              onDelete={handleDeleteItem}
            />
          ) : (
            /* Explore tab — editorial corridor */
            filteredVisitId ? (() => {
              const activeVisit = filteredVisitId === 'active' ? visit : undefined; // Simplified for now, or fetch from a list if we had one
              const exhibitionItems = items.filter(i => i.visitId === filteredVisitId || (filteredVisitId === 'active' && i.visitId === visit.id));
              return (
                <ExhibitionHallView
                  items={exhibitionItems}
                  visit={activeVisit || { id: filteredVisitId, title: exhibitionItems[0]?.sessionTitle || "PERSONAL VISIT", itemIds: exhibitionItems.map(i => i.id), globalConversation: [] }}
                  onClose={() => setFilteredVisitId(null)}
                  onInterpret={setInterpretingItem}
                  onOpenCuratorRoom={(msg) => setCuratorRoomContext({ items: exhibitionItems, visitId: filteredVisitId, initialMessage: msg })}
                  onDeleteItem={handleDeleteItem}
                  onContinueVisit={() => {
                    handleResumeVisit(filteredVisitId);
                    // Automatically trigger album picker when continuing visit
                    albumInputRef.current?.click();
                  }}
                />
              );
            })() : (
              <div className="flex flex-col w-full h-full">

              {/* ① Dynamic metadata row — Center aligned visit name + date */}
              <div className="shrink-0 h-auto flex flex-col items-center justify-center px-10 sm:px-16 overflow-hidden py-4">
                {activeDisplayItem && (() => {
                  const title = activeDisplayItem.sessionTitle || parseDisplayLocation(activeDisplayItem.location) || "Personal Visit";
                  const dt = activeDisplayItem.photoTime ? parseDisplayDate(activeDisplayItem.photoTime) : null;
                  return (
                    <div className="text-center" key={activeDisplayItem.id}>
                      <h2 className="text-[10px] sm:text-[11px] tracking-[0.3em] uppercase text-neutral-800 font-bold mb-1 truncate max-w-[80vw]">
                        {title}
                      </h2>
                      {dt && (
                        <p className="text-[9px] sm:text-[10px] tracking-[0.2em] uppercase text-neutral-400 font-medium">
                          {dt}
                        </p>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* ② Image strip — fills remaining vertical space */}
              <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="flex-1 min-h-0 flex items-center overflow-x-auto overflow-y-hidden snap-x snap-mandatory horizontal-corridor no-scrollbar"
              >
                {isGalleryEmpty ? (
                  <div className="snap-center shrink-0 w-screen flex items-center justify-center">
                    <EmptyWall isVisitMode={isVisitMode} />
                  </div>
                ) : (
                  <div className="min-w-[calc(50vw-32vh)] sm:min-w-[calc(50vw-28vh)] h-full shrink-0" />
                )}

                {!isGalleryEmpty && corridorEntries.map((entry, idx) => {
                  const isActive = idx === (thumbEntries[activeThumbIndex]?.sourceIndex ?? 0);
                  return (
                    <div
                      key={entry.type === 'item' ? entry.item.id : entry.visitId}
                      className="snap-center shrink-0 h-full flex items-center mx-6 sm:mx-16"
                      ref={(el) => { galleryEntryRefs.current[idx] = el; }}
                    >
                      {entry.type === 'item' ? (
                        <GalleryCard
                          item={entry.item}
                          isActive={isActive}
                          onInterpret={() => {
                            const visitItems = items.filter(i => i.visitId === entry.item.visitId);
                            setInterpretingItem({
                              ...entry.item,
                              visitId: entry.item.visitId,
                              allVisitItems: visitItems.length > 0 ? visitItems : [entry.item]
                            });
                          }}
                          onDelete={() => handleDeleteItem(entry.item.id)}
                          onContinueVision={!filteredVisitId ? () => handleContinueVision(entry.item) : undefined}
                        />
                      ) : (
                        <VisitStack
                          items={entry.items}
                          isActive={isActive}
                          onOpenExhibition={() => setFilteredVisitId(entry.visitId)}
                          onInterpret={(item) => setInterpretingItem({ ...item, allVisitItems: entry.items, visitId: entry.visitId })}
                          onResumeVisit={!filteredVisitId ? (source) => {
                            handleResumeVisit(entry.visitId);
                            setTimeout(() => {
                              if (source === 'camera') cameraInputRef.current?.click();
                              else albumInputRef.current?.click();
                            }, 100);
                          } : undefined}
                          onDeleteItem={handleDeleteItem}
                          onDeleteSession={() => handleDeleteSession(entry.visitId)}
                        />
                      )}
                    </div>
                  );
                })}

                {/* Global analyzing loader removed from corridor to prevent layout jumps/blinking. 
                    The FAB loader and modal badges sufficiently cover this state. */}

                {!isGalleryEmpty && <div className="min-w-[calc(50vw-32vh)] sm:min-w-[calc(50vw-28vh)] h-full shrink-0" />}
              </div>

              {/* ③ Tags row */}
              <div className="shrink-0 h-8 flex items-center gap-5 px-10 sm:px-16 overflow-x-auto no-scrollbar">
                {activeDisplayItem?.keywords?.map((kw, i) => (
                  <span key={i} className="text-[8px] sm:text-[9px] tracking-[0.22em] uppercase text-neutral-400 whitespace-nowrap font-medium">
                    {kw}
                  </span>
                ))}
              </div>

              {/* ④ Thumbnail strip — in flow, never overlaps images */}
              {thumbEntries.length > 1 && (
                <div className="shrink-0 flex items-center justify-center gap-4 px-10 sm:px-16 h-11">
                  {/* Counter */}
                  <span className="text-[9px] tracking-[0.15em] text-neutral-300 tabular-nums shrink-0 font-medium">
                    {String(activeThumbIndex + 1).padStart(2, '0')}<span className="text-neutral-200 mx-0.5">/</span>{String(thumbEntries.length).padStart(2, '0')}
                  </span>
                  {/* Thumbnails */}
                  <div
                    ref={thumbStripRef}
                    className="flex items-center gap-2 overflow-x-auto no-scrollbar"
                  >
                    {thumbEntries.map((entry, idx) => (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => {
                          galleryEntryRefs.current[entry.sourceIndex]?.scrollIntoView({
                            behavior: 'smooth', block: 'nearest', inline: 'center'
                          });
                        }}
                        className={`overflow-hidden shrink-0 transition-all duration-300 ${
                          idx === activeThumbIndex
                            ? 'w-7 h-7 opacity-100 outline outline-1 outline-neutral-400 outline-offset-1'
                            : 'w-5 h-5 opacity-25 hover:opacity-55'
                        }`}
                      >
                        <img src={entry.url} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Spacer for fixed controls bar */}
              <div className="shrink-0" style={{ height: 'max(calc(env(safe-area-inset-bottom, 0px) + 5rem), 5.5rem)' }} />
            </div>
          ))}
        </div>

        {activeTab === 'learn' && learnSubTab === 'taste-map' && (
          <>
            <TopographyView
              items={items}
              cachedTagMap={tagPositions}
              neighborItems={MOCK_NEIGHBORS}
              onClose={() => setLearnSubTab('curator')}
            />
            {/* Sub-tab bar rendered at top level so it sits above TopographyView's z-[60] */}
            <div className="fixed top-11 left-0 right-0 z-[70] flex items-end gap-7 px-5 sm:px-8 border-b border-neutral-100 bg-[#faf9f7]">
              {(['curator', 'taste-map', 'skills', 'profile'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setLearnSubTab(tab)}
                  className={`pt-3 pb-3 text-[11px] sm:text-[12px] tracking-[0.14em] uppercase font-semibold border-b-2 transition-all -mb-px whitespace-nowrap ${
                    learnSubTab === tab
                      ? 'border-neutral-900 text-neutral-900'
                      : 'border-transparent text-neutral-400 hover:text-neutral-700'
                  }`}
                >{tab === 'curator' ? 'Curator' : tab === 'taste-map' ? 'Taste Map' : tab === 'skills' ? 'Art Skills' : 'Profile'}</button>
              ))}
            </div>
          </>
        )}

        {interpretingItem && (
          <InterpretationModal
            item={interpretingItem}
            onClose={() => setInterpretingItem(null)}
            onUpdateConversation={updateItemConversation}
            onUpdateMetadata={updateItemMetadata}
            onDelete={handleDeleteItem}
            sessionId={visit.id}
            allVisitItems={interpretingItem.allVisitItems}
            onNavigate={handleNavigateInterpretation}
            externalMessage={artworkChatMessage ?? undefined}
            onExternalMessageConsumed={() => setArtworkChatMessage(null)}
            rightMode={interpretationRightMode}
            onRightModeChange={setInterpretationRightMode}
            isLiked={likedIds.has(interpretingItem.id)}
            albums={albums}
            itemAlbumIds={albums.filter(a => a.itemIds.includes(interpretingItem.id)).map(a => a.id)}
            onToggleLike={() => handleToggleLike(interpretingItem.id)}
            onSaveToAlbum={(albumIds) => handleSaveToAlbums(interpretingItem.id, albumIds)}
            onCreateAlbum={(name) => handleCreateAlbum(name, interpretingItem.id)}
            interpretingMode={interpretingMode}
            onSwitchMode={() => {
              const next = interpretingMode === 'professional' ? 'interactive' : 'professional';
              setInterpretingMode(next);
              localStorage.setItem('musee_analysis_mode', next);
            }}
            onRetryHarder={handleRetryHarder}
            onReanalyze={handleReanalyze}
            userId={currentUser?.user_id || USER_ID}
          />
        )}

        {curatorRoomContext && (
          <CuratorRoom
            items={
              items.filter(i => 
                curatorRoomContext.visitId ? i.visitId === curatorRoomContext.visitId : 
                curatorRoomContext.items.some(ci => ci.id === i.id)
              )
            }
            conversation={visit.globalConversation}
            onClose={() => setCuratorRoomContext(null)}
            onUpdateConversation={(msgs) => setVisit(prev => ({ ...prev, globalConversation: [...prev.globalConversation, ...msgs] }))}
            onDeleteItem={handleDeleteItem}
            onInterpret={setInterpretingItem}
            initialMessage={curatorRoomContext.initialMessage}
          />
        )}

        {/* Hidden inputs for programmatic triggering */}
        <input
          ref={albumInputRef}
          type="file"
          className="hidden"
          accept="image/*"
          onChange={e => handleFileUpload(e, 'gallery')}
          multiple
        />
        <input
          ref={cameraInputRef}
          type="file"
          className="hidden"
          accept="image/*"
          capture="environment"
          onChange={e => handleFileUpload(e, 'camera')}
        />

        {/* Delete Confirmation Modal */}
        {deleteConfirmation && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
            <div className="absolute inset-0 bg-neutral-900/60 backdrop-blur-sm" onClick={() => setDeleteConfirmation(null)} />
            <div className="relative bg-white rounded-[2rem] p-10 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-300">
              <div className="w-12 h-12 bg-neutral-100 rounded-full flex items-center justify-center mb-6">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#171717" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
              </div>
              <h3 className="text-xl font-serif text-neutral-900 mb-3">
                {deleteConfirmation.type === 'item' ? 'Remove Artwork?' : 'Delete Visit Record?'}
              </h3>
              <p className="text-sm text-neutral-500 leading-relaxed mb-8">
                {deleteConfirmation.type === 'item'
                  ? 'This will permanently remove this piece and its curated analysis from your Musee.'
                  : 'This will delete the entire visit record and all associated artwork analysis.'}
              </p>
              <div className="flex space-x-3">
                <button
                  onClick={() => setDeleteConfirmation(null)}
                  className="flex-1 px-6 py-3 rounded-full text-[10px] tracking-[0.3em] uppercase font-bold text-neutral-500 hover:bg-neutral-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (deleteConfirmation.type === 'item') confirmDeleteItem(deleteConfirmation.id);
                    else confirmDeleteSession(deleteConfirmation.id);
                  }}
                  className="flex-1 bg-neutral-900 text-white px-6 py-3 rounded-full text-[10px] tracking-[0.3em] uppercase font-bold hover:bg-black transition-colors shadow-lg shadow-neutral-200"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Universal Contextual Action Bar (Phase 8) */}
        {activeTab === 'explore' && (
          <ContextualActionBar
            mode={interpretingItem ? 'interpretation' : filteredVisitId ? 'hall' : 'corridor'}
            onUpload={handleFileUpload}
            isAnalyzing={isAnalyzing}
            onChat={handleOpenCurator}
            onInquiry={handleInquiry}
            onLike={() => interpretingItem && handleToggleLike(interpretingItem.id)}
            isLiked={!!(interpretingItem && likedIds.has(interpretingItem.id))}
            onDelete={() => interpretingItem && setDeleteConfirmation({ type: 'item', id: interpretingItem.id })}
            onCollect={() => interpretingItem && alert('Collection feature coming soon')}
            activeItem={interpretingItem as unknown as GalleryItem || undefined}
            placeholder={filteredVisitId ? `Ask about ${items.find(i => i.visitId === filteredVisitId)?.sessionTitle || 'this exhibition'}...` : undefined}
            isAskExpanded={interpretationAskExpanded}
            onAskExpand={() => { setInterpretationAskExpanded(true); setInterpretationRightMode('chat'); }}
            onAskCollapse={() => { setInterpretationAskExpanded(false); setInterpretationRightMode('metadata'); }}
          />
        )}

      </div>
    </GoogleOAuthProvider>
  );
};

export default App;
