import React, { useState, useRef, useMemo, useEffect } from 'react';
import ExifReader from 'exifreader';
import { GalleryItem, NeighborItem, Message, Visit, TagCoordinate, Annotation, CuratorConversation } from './types';
import { GoogleOAuthProvider } from '@react-oauth/google';
import GoogleLogin from './components/GoogleLogin';
import {
  analyzeArtworkStream,
  analyzeArtwork,
  ArtworkAnalysisResult,
  StreamingMetrics,
  getOrCreateUserId,
  fetchUserArtworks,
  getBaseDomain,
  resolveImageUrl,
  deleteArtwork,
  deleteSession,
  getCurrentUser,
  logout
} from './apiService';
import GalleryCard from './components/GalleryCard';
import VisitStack from './components/VisitStack';
import Controls from './components/Controls';
import InterpretationModal from './components/InterpretationModal';
import ExhibitionHall from './components/ExhibitionHall';
import EmptyWall from './components/EmptyWall';
import UnderstandView from './components/UnderstandView';
import OrganizeView from './components/OrganizeView';

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
  const [activeTab, setActiveTab] = useState<'explore' | 'understand' | 'organize'>('explore');
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
    keywords?: string[],
    date?: string,
    medium?: string,
    artworkId?: string,
    isAnalyzing?: boolean,
    streamingText?: string,
    visitId?: string,
    allVisitItems?: GalleryItem[]
  } | null>(null);
  const [exhibitionContext, setExhibitionContext] = useState<{ items: GalleryItem[], visitId?: string, initialMessage?: string } | null>(null);

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
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ id: string, type: 'item' | 'session' } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 640);
  const [language, setLanguage] = useState(localStorage.getItem('musee_language') || 'en');

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

  const [visit, setVisit] = useState<Visit>({
    id: 'initial-' + Math.random().toString(36).substring(7),
    active: false,
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
              timestamp: item.created_at ? new Date(item.created_at).getTime() : Date.now(),
              visitId: item.session_id,
              location: item.location && typeof item.location === 'object' ? JSON.stringify(item.location) : item.location,
              photoTime: item.photo_time,
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

  const corridorEntries = useMemo(() => {
    const entries: Array<{ type: 'item', item: GalleryItem } | { type: 'stack', items: GalleryItem[], visitId: string }> = [];
    let currentStack: GalleryItem[] = [];
    let currentVisitId: string | null = null;

    // Filter items based on active session or manual filter
    const activeId = filteredVisitId || (visit.active ? visit.id : null);
    const filteredItems = activeId
      ? items.filter(i => i.visitId === activeId || (visit.active && visit.itemIds.includes(i.id)))
      : items;

    filteredItems.forEach(item => {
      const isFromFinishedVisit = item.visitId && (!visit.active || visit.id !== item.visitId) && item.visitId !== filteredVisitId;
      if (isFromFinishedVisit) {
        if (currentVisitId === item.visitId) {
          currentStack.push(item);
        } else {
          if (currentStack.length > 0) entries.push({ type: 'stack', items: [...currentStack], visitId: currentVisitId! });
          currentStack = [item];
          currentVisitId = item.visitId!;
        }
      } else {
        if (currentStack.length > 0) {
          entries.push({ type: 'stack', items: [...currentStack], visitId: currentVisitId! });
          currentStack = [];
          currentVisitId = null;
        }
        entries.push({ type: 'item', item });
      }
    });
    if (currentStack.length > 0) entries.push({ type: 'stack', items: [...currentStack], visitId: currentVisitId! });
    return entries;
  }, [items, visit, filteredVisitId]);

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

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    const maxScroll = scrollWidth - clientWidth;
    if (maxScroll <= 0) return;
    const progress = scrollLeft / maxScroll;
    const edgeThreshold = 6;
    setGalleryEdges({
      hasPrev: scrollLeft > edgeThreshold,
      hasNext: scrollLeft < maxScroll - edgeThreshold
    });
    setActiveThumbIndex(Math.round(progress * Math.max(thumbEntries.length - 1, 0)));
    if (thumbStripRef.current) {
      const thumbMax = thumbStripRef.current.scrollWidth - thumbStripRef.current.clientWidth;
      if (thumbMax > 0) {
        thumbStripRef.current.scrollLeft = (scrollLeft / maxScroll) * thumbMax;
      }
    }
  };

  const handleStartVisit = () => {
    setVisit({
      id: Math.random().toString(36).substring(2, 11),
      active: true,
      itemIds: [],
      globalConversation: []
    });
  };

  const handleEndVisit = () => {
    setVisit(prev => ({ ...prev, active: false }));
  };

  const handleResumeVisit = (visitId: string) => {
    const visitItems = items.filter(i => i.visitId === visitId);
    setVisit({
      id: visitId,
      active: true,
      itemIds: visitItems.map(i => i.id),
      globalConversation: [] // We don't have global history stored yet, but we can resume adding
    });
  };

  const handleContinueVision = (item: GalleryItem) => {
    // Start a new visit with this item
    const newVisitId = Math.random().toString(36).substring(2, 11);

    // Update the local item to use this new visit ID
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, visitId: newVisitId } : i));

    // Set active visit
    setVisit({
      id: newVisitId,
      active: true,
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

  /* ── EXIF GPS: read lat/lon from image file metadata ─────── */
  const readExifGps = async (file: File): Promise<{ latitude: number; longitude: number } | undefined> => {
    try {
      const tags = await ExifReader.load(file, { expanded: true });
      const lat = tags.gps?.Latitude;
      const lon = tags.gps?.Longitude;
      if (typeof lat === 'number' && typeof lon === 'number') {
        return { latitude: lat, longitude: lon };
      }
    } catch {
      // No EXIF or no GPS tag — silently ignore
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

    return { city, country, museum };
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
    console.log('handleFileUpload called', mode);
    const files = Array.from(event.target.files || []);
    console.log('Files selected:', files.length);
    if (files.length === 0) return;

    // Reset input so the same file can be selected again
    event.target.value = '';

    // Single file upload: Open modal immediately and stream analysis
    if (files.length === 1) {
      const file = files[0];
      const newItemId = Math.random().toString(36).substring(2, 11);

      // Get location: EXIF GPS for gallery imports, device GPS for camera/visit
      const coords = mode === 'gallery'
        ? await readExifGps(file)
        : await getCurrentLocation();
      const photoTime = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        const placeholderItem: GalleryItem = {
          id: newItemId,
          url: base64,
          keywords: [],
          vibe: {
            backgroundColor: '#ffffff',
            padding: 4,
            borderRadius: '12px',
            borderType: 'solid',
            accentColor: '#000000'
          },
          timestamp: Date.now(),
          conversation: [],
          annotations: [],
          visitId: visit.active ? visit.id : undefined,
          isAnalyzing: true,
          streamingText: '',
          location: coords ? JSON.stringify({ latitude: coords.latitude, longitude: coords.longitude, city: '', country: '', museum: '' }) : undefined,
          photoTime: photoTime
        };

        setItems(prev => [placeholderItem, ...prev]);
        if (visit.active) setVisit(prev => ({ ...prev, itemIds: [...prev.itemIds, newItemId] }));

        // Background museum resolution — update location once Nominatim responds
        if (coords) {
          resolveMuseum(coords.latitude, coords.longitude).then(({ city, country, museum }) => {
            const resolved = JSON.stringify({ latitude: coords.latitude, longitude: coords.longitude, city, country, museum });
            setItems(prev => prev.map(item => item.id === newItemId ? { ...item, location: resolved } : item));
          });
        }

        // Open modal immediately
        setInterpretingItem({
          ...placeholderItem,
          visitId: visit.active ? visit.id : undefined,
          allVisitItems: visit.active
            ? [...items, placeholderItem].filter(i => i.visitId === visit.id || visit.itemIds.includes(i.id) || i.id === newItemId)
            : undefined,
          streamingText: ''
        });

        console.log('Starting streaming analysis for single file:', file.name);

        await analyzeArtworkStream(
          file,
          USER_ID,
          (chunk) => {
            // Update streaming text in both places
            setInterpretingItem(prev => (prev && prev.id === newItemId) ? {
              ...prev,
              streamingText: (prev.streamingText || '') + chunk
            } : prev);
          },
          (analysis) => {
            const keywords = analysis.tags.map((tag: string) =>
              tag.startsWith('#') ? tag.toLowerCase() : `#${tag.toLowerCase()}`
            );

            // Update tag positions
            setTagPositions(prev => {
              const updated = { ...prev };
              keywords.forEach((tag: string) => {
                if (!updated[tag]) {
                  updated[tag] = {
                    x: (Math.random() * 2 - 1),
                    y: (Math.random() * 2 - 1)
                  };
                }
              });
              return updated;
            });

            const finalItemUpdates = {
              keywords: keywords,
              artistName: analysis.artist_name,
              artworkName: analysis.artwork_name,
              description: parseAnalysis(analysis.description),
              date: analysis.date,
              medium: analysis.medium,
              artworkId: analysis.artwork_id,
              isAnalyzing: false,
              streamingText: undefined,
              location: analysis.location && typeof analysis.location === 'object' ? JSON.stringify(analysis.location) : analysis.location,
              photoTime: analysis.photo_time
            };

            // Update gallery
            setItems(prev => prev.map(item => item.id === newItemId ? {
              ...item,
              ...finalItemUpdates
            } : item));

            // Update modal
            setInterpretingItem(prev => (prev && prev.id === newItemId) ? {
              ...prev,
              ...finalItemUpdates
            } : prev);
          },
          (error) => {
            console.error('Streaming analysis failed:', error);
            const message = error?.message || 'Analysis failed. Please try again.';
            const errorUpdates = { isAnalyzing: false, streamingText: message };
            setItems(prev => prev.map(item => item.id === newItemId ? { ...item, ...errorUpdates } : item));
            setInterpretingItem(prev => (prev && prev.id === newItemId) ? { ...prev, ...errorUpdates } : prev);
          },
          visit.active ? visit.id : Math.random().toString(36).substring(2, 11),
          undefined,
          undefined,
          photoTime,
          coords?.latitude,
          coords?.longitude
        );
      } catch (error) {
        console.error('Failed to prepare single upload:', error);
      }
    }
    // Batch upload: Keep current background processing implementation
    else {
      // Batch is always gallery import — read EXIF per file (each photo may have its own location)
      const photoTime = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

      files.forEach(async (file) => {
        console.log('Processing batch file:', file.name);
        const newItemId = Math.random().toString(36).substring(2, 11);

        try {
          // Read EXIF GPS per file
          const coords = await readExifGps(file);

          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });

          const placeholderItem: GalleryItem = {
            id: newItemId,
            url: base64,
            keywords: [],
            vibe: {
              backgroundColor: '#ffffff',
              padding: 4,
              borderRadius: '12px',
              borderType: 'solid',
              accentColor: '#000000'
            },
            timestamp: Date.now(),
            conversation: [],
            annotations: [],
            visitId: visit.active ? visit.id : undefined,
            isAnalyzing: true,
            streamingText: '',
            location: coords ? JSON.stringify({ latitude: coords.latitude, longitude: coords.longitude, city: '', country: '', museum: '' }) : undefined,
            photoTime: photoTime
          };

          setItems(prev => [placeholderItem, ...prev]);
          if (visit.active) setVisit(prev => ({ ...prev, itemIds: [...prev.itemIds, newItemId] }));

          // Background museum resolution per file
          if (coords) {
            resolveMuseum(coords.latitude, coords.longitude).then(({ city, country, museum }) => {
              const resolved = JSON.stringify({ latitude: coords.latitude, longitude: coords.longitude, city, country, museum });
              setItems(prev => prev.map(item => item.id === newItemId ? { ...item, location: resolved } : item));
            });
          }

          const analysis = await analyzeArtwork(
            file,
            USER_ID,
            undefined,
            visit.active ? visit.id : Math.random().toString(36).substring(2, 11),
            undefined,
            photoTime,
            coords?.latitude,
            coords?.longitude
          );
          const keywords = analysis.tags.map((tag: string) =>
            tag.startsWith('#') ? tag.toLowerCase() : `#${tag.toLowerCase()}`
          );

          setTagPositions(prev => {
            const updated = { ...prev };
            keywords.forEach((tag: string) => {
              if (!updated[tag]) updated[tag] = { x: (Math.random() * 2 - 1), y: (Math.random() * 2 - 1) };
            });
            return updated;
          });

          setItems(prev => prev.map(item => item.id === newItemId ? {
            ...item,
            keywords: keywords,
            artistName: analysis.artist_name,
            artworkName: analysis.artwork_name,
            description: parseAnalysis(analysis.description),
            date: analysis.date,
            medium: analysis.medium,
            artworkId: analysis.artwork_id,
            isAnalyzing: false,
            location: analysis.location && typeof analysis.location === 'object' ? JSON.stringify(analysis.location) : analysis.location,
            photoTime: analysis.photo_time
          } : item));

        } catch (error) {
          console.error(`Failed to analyze ${file.name}:`, error);
          setItems(prev => prev.map(item => item.id === newItemId ? { ...item, isAnalyzing: false } : item));
        }
      });
    }

  };

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

  const updateItemAnnotations = (id: string, annotations: Annotation[]) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, annotations } : item));
    if (interpretingItem?.id === id) setInterpretingItem(prev => prev ? { ...prev, annotations } : null);
  };

  const updateItemMetadata = (id: string, updates: { artistName?: string; artworkName?: string; date?: string; medium?: string; keywords?: string[] }) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
    setInterpretingItem(prev => prev?.id === id ? { ...prev, ...updates } : prev);
  };

  const handleDeleteItem = (id: string) => {
    setDeleteConfirmation({ id, type: 'item' });
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

  return (
    <GoogleOAuthProvider clientId={googleClientId}>
      <div className="relative w-screen h-screen bg-[#fdfdfd] overflow-hidden flex flex-col transition-colors duration-1000">
        {/* User Auth Info */}
        <div className="fixed top-2 right-3 sm:right-4 z-50 flex items-center space-x-4">
          {currentUser ? (
            <div className="relative group">
              <button
                onClick={() => setSettingsOpen(!settingsOpen)}
                className="w-8 h-8 sm:w-10 sm:h-10 rounded-full overflow-hidden border-2 border-white shadow-lg hover:scale-110 transition-all active:scale-95"
                title={`${currentUser.full_name} — settings`}
              >
                <img
                  src={currentUser.profile_picture_url}
                  alt={currentUser.full_name}
                  className="w-full h-full object-cover"
                />
              </button>
              <div className="absolute top-full right-0 mt-2 bg-white rounded-lg shadow-xl border border-neutral-100 px-3 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                <span className="text-[8px] tracking-[0.2em] uppercase text-neutral-500">{currentUser.full_name.split(' ')[0]} · Settings</span>
              </div>
            </div>
          ) : (
            <div className="bg-white/10 backdrop-blur-md p-1 rounded-full border border-white/20 shadow-xl">
              <GoogleLogin
                onLoginSuccess={handleLoginSuccess}
                onLoginError={(err) => alert(`Login Error: ${err}`)}
              />
            </div>
          )}
        </div>

        {/* Settings backdrop */}
        {settingsOpen && (
          <div className="fixed inset-0 z-50 bg-black/20" onClick={() => setSettingsOpen(false)} />
        )}

        {/* Settings panel */}
        <div className={`fixed top-0 right-0 h-full w-72 bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-out ${settingsOpen ? 'translate-x-0' : 'translate-x-full'}`}>
          {currentUser && (
            <>
              {/* User header */}
              <div className="p-6 pt-8 border-b border-neutral-100">
                <div className="flex items-center space-x-3">
                  <img
                    src={currentUser.profile_picture_url}
                    alt={currentUser.full_name}
                    className="w-12 h-12 rounded-full object-cover border border-neutral-200"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-neutral-900 truncate">{currentUser.full_name}</p>
                    <p className="text-[11px] text-neutral-400 truncate">{currentUser.email}</p>
                  </div>
                </div>
              </div>

              {/* Options */}
              <div className="p-5 space-y-5">
                {/* Language toggle */}
                <div>
                  <label className="text-[10px] tracking-[0.2em] uppercase text-neutral-400 font-medium">Language</label>
                  <div className="flex mt-2 bg-neutral-100 rounded-full p-0.5">
                    <button
                      onClick={() => { setLanguage('en'); localStorage.setItem('musee_language', 'en'); }}
                      className={`flex-1 px-4 py-1.5 rounded-full text-xs font-medium transition-all ${language === 'en' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-400 hover:text-neutral-600'}`}
                    >
                      EN
                    </button>
                    <button
                      onClick={() => { setLanguage('zh'); localStorage.setItem('musee_language', 'zh'); }}
                      className={`flex-1 px-4 py-1.5 rounded-full text-xs font-medium transition-all ${language === 'zh' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-400 hover:text-neutral-600'}`}
                    >
                      中文
                    </button>
                  </div>
                </div>

                {/* Personalization placeholder */}
                <div>
                  <label className="text-[10px] tracking-[0.2em] uppercase text-neutral-400 font-medium">Personalization</label>
                  <p className="text-xs text-neutral-300 mt-1.5">Coming soon</p>
                </div>
              </div>

              {/* Logout */}
              <div className="absolute bottom-0 w-full p-5 border-t border-neutral-100">
                <button
                  onClick={() => { setSettingsOpen(false); handleLogout(); }}
                  className="w-full py-2.5 rounded-full text-[10px] tracking-[0.2em] uppercase font-bold text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900 transition-all border border-neutral-200"
                >
                  Logout
                </button>
              </div>
            </>
          )}
        </div>

        {/* Top Tab Bar — Explore / Understand / Organize */}
        <div
          className="fixed top-4 left-1/2 -translate-x-1/2 z-40 flex items-center bg-white/80 backdrop-blur-md border border-neutral-200 rounded-full shadow-sm px-1 py-1"
          style={{ pointerEvents: 'auto' }}
        >
          {(['explore', 'understand', 'organize'] as const).map(tab => (
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

        {/* Sidebar toggle — same row as tab pill, left-aligned */}
        {activeTab === 'understand' && (
          <button
            onClick={() => setSidebarOpen(p => !p)}
            title={sidebarOpen ? 'Hide history' : 'Show history'}
            className="fixed top-2 left-4 z-40 w-7 h-7 flex items-center justify-center rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
            style={{ pointerEvents: 'auto' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <path d="M9 3v18"/>
            </svg>
          </button>
        )}

        {/* Divider line — visible below tab pill on Understand / Organize */}
        {activeTab !== 'explore' && (
          <div className="fixed top-10 left-0 right-0 z-30 h-px bg-neutral-100" />
        )}

        {/* 1. Status Pill — top center, informational only */}
        {(visit.active || filteredVisitId) && (
          <div className="fixed top-3 sm:top-4 left-1/2 -translate-x-1/2 z-40 bg-neutral-900/80 backdrop-blur-md text-white px-4 sm:px-5 py-1.5 sm:py-2 rounded-full text-[8px] sm:text-[9px] tracking-[0.2em] uppercase flex items-center space-x-2 sm:space-x-3 shadow-xl border border-white/10" style={{ pointerEvents: 'none' }}>
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${visit.active && !filteredVisitId ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-500'}`} />
            <span className="font-bold whitespace-nowrap">
              {filteredVisitId ? 'Recorded Visit' : 'Exhibition in Progress'}
            </span>
            <span className="text-white/30">·</span>
            <span className="opacity-70 whitespace-nowrap">
              {items.filter(i => i.visitId === (filteredVisitId || visit.id)).length} Pieces
            </span>
          </div>
        )}

        {/* 2. Exhibition Hall Input — below status pill, inline input */}
        {(visit.active || filteredVisitId) && (
          <div
            className={`fixed top-11 sm:top-12 left-1/2 -translate-x-1/2 z-40 bg-white/90 backdrop-blur-md px-4 sm:px-5 py-1.5 sm:py-2 rounded-full text-[10px] sm:text-xs tracking-wider flex items-center space-x-2 sm:space-x-3 shadow-lg border transition-all w-[260px] sm:w-[320px] ${exhibitionInputFocused ? 'border-neutral-400 bg-white' : 'border-neutral-200'}`}
            style={{ pointerEvents: 'auto' }}
            onClick={() => exhibitionInputRef.current?.focus()}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-40">
              <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              ref={exhibitionInputRef}
              value={exhibitionInput}
              onChange={(e) => setExhibitionInput(e.target.value)}
              onFocus={() => setExhibitionInputFocused(true)}
              onBlur={() => setExhibitionInputFocused(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && exhibitionInput.trim()) {
                  const sessionItems = items.filter(i => i.visitId === (filteredVisitId || visit.id));
                  setExhibitionContext({ items: sessionItems, visitId: filteredVisitId || (visit.active ? visit.id : undefined), initialMessage: exhibitionInput.trim() });
                  setExhibitionInput('');
                }
              }}
              placeholder="Ask about this exhibition..."
              className="flex-1 bg-transparent outline-none text-neutral-600 placeholder-neutral-400"
            />
            {exhibitionInput.trim() && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const sessionItems = items.filter(i => i.visitId === (filteredVisitId || visit.id));
                  setExhibitionContext({ items: sessionItems, visitId: filteredVisitId || (visit.active ? visit.id : undefined), initialMessage: exhibitionInput.trim() });
                  setExhibitionInput('');
                }}
                className="shrink-0 w-6 h-6 rounded-full bg-neutral-900 text-white flex items-center justify-center hover:scale-110 active:scale-95 transition-transform"
              >
                <span className="text-[10px]">↑</span>
              </button>
            )}
          </div>
        )}

        {/* 3. Right Side Actions — only actionable buttons */}
        {(visit.active || filteredVisitId) && (
          <div className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 z-40 flex flex-col items-center space-y-3 sm:space-y-4" style={{ pointerEvents: 'auto' }}>
            <button
              onClick={() => {
                if (filteredVisitId) {
                  handleResumeVisit(filteredVisitId);
                  setFilteredVisitId(null);
                } else {
                  handleEndVisit();
                }
              }}
              className="bg-neutral-900/80 backdrop-blur-md text-white/80 hover:text-emerald-400 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-[8px] sm:text-[9px] tracking-[0.2em] uppercase font-bold shadow-xl border border-white/10 transition-all active:scale-95 whitespace-nowrap"
            >
              {filteredVisitId ? (<>Continue<br className="sm:hidden" /> the Visit</>) : (<>End<br className="sm:hidden" /> the Visit</>)}
            </button>
            {filteredVisitId && (
              <button
                onClick={() => setFilteredVisitId(null)}
                className="bg-neutral-900/60 backdrop-blur-md text-white/40 hover:text-white/80 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-[8px] sm:text-[9px] tracking-[0.2em] uppercase font-medium shadow-lg border border-white/10 transition-all active:scale-95"
              >
                Back
              </button>
            )}
          </div>
        )}

        <div className={`relative z-10 flex-1 transition-all duration-700 ease-in-out ${activeTab !== 'explore' ? 'pt-11' : 'pt-10'} ${(interpretingItem || exhibitionContext) ? 'opacity-40 blur-sm' : 'opacity-100'}`}>
          {activeTab === 'understand' ? (
            <UnderstandView
              items={items}
              sidebarOpen={sidebarOpen}
              onCloseSidebar={() => setSidebarOpen(false)}
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
          ) : activeTab === 'organize' ? (
            <OrganizeView
              items={items}
              visit={visit}
              filteredVisitId={filteredVisitId}
              isAnalyzing={isAnalyzing}
              tagPositions={tagPositions}
              neighborItems={MOCK_NEIGHBORS}
              onInterpret={(item) => {
                const activeId = filteredVisitId || (visit.active ? visit.id : null);
                const sessionItems = activeId ? items.filter(i => i.visitId === activeId || (visit.active && visit.itemIds.includes(i.id))) : undefined;
                setInterpretingItem({ ...item, visitId: item.visitId, allVisitItems: sessionItems });
              }}
              onDelete={handleDeleteItem}
            />
          ) : (
            /* Explore tab — immersive corridor view */
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="horizontal-corridor w-full h-full flex items-center overflow-x-auto overflow-y-hidden snap-x snap-mandatory"
            >
              {/* Initial Gallery State / Empty Room */}
              {isGalleryEmpty ? (
                <div className="snap-center shrink-0">
                  <EmptyWall />
                </div>
              ) : (
                <div className="min-w-[5vw] sm:min-w-[30vw] h-full shrink-0" />
              )}

              {corridorEntries.map((entry, idx) => {
                return entry.type === 'item' ? (
                  <div
                    key={entry.item.id}
                    className="snap-center shrink-0 opacity-100 transition-all duration-500"
                    ref={(el) => {
                      galleryEntryRefs.current[idx] = el;
                    }}
                  >
                    <GalleryCard
                      item={entry.item}
                      onInterpret={() => {
                        const activeId = filteredVisitId || (visit.active ? visit.id : null);
                        const sessionItems = activeId
                          ? items.filter(i => i.visitId === activeId || (visit.active && visit.itemIds.includes(i.id)))
                          : undefined;

                        setInterpretingItem({
                          ...entry.item,
                          visitId: entry.item.visitId || (visit.active && visit.itemIds.includes(entry.item.id) ? visit.id : undefined),
                          allVisitItems: sessionItems
                        });
                      }}
                      onDelete={() => handleDeleteItem(entry.item.id)}
                      onContinueVision={(!visit.active && !filteredVisitId) ? () => handleContinueVision(entry.item) : undefined}
                    />
                  </div>
                ) : (
                  <div
                    key={entry.visitId}
                    className="snap-center shrink-0"
                    ref={(el) => {
                      galleryEntryRefs.current[idx] = el;
                    }}
                  >
                    <VisitStack
                      items={entry.items}
                      onOpenExhibition={() => setFilteredVisitId(entry.visitId)}
                      onInterpret={(item) => setInterpretingItem({
                        ...item,
                        allVisitItems: entry.items,
                        visitId: entry.visitId
                      })}
                      onResumeVisit={(!visit.active && !filteredVisitId) ? (source) => {
                        handleResumeVisit(entry.visitId);
                        setTimeout(() => {
                          if (source === 'camera') cameraInputRef.current?.click();
                          else albumInputRef.current?.click();
                        }, 100);
                      } : undefined}
                      onDeleteItem={handleDeleteItem}
                      onDeleteSession={() => handleDeleteSession(entry.visitId)}
                    />
                  </div>
                );
              })}

              {isAnalyzing && (
                <div className="min-w-[80vw] sm:min-w-[400px] h-[60vh] mx-3 sm:mx-12 flex flex-col items-center justify-center space-y-4 snap-center shrink-0">
                  <div className="w-12 h-12 border-t-2 border-neutral-800 rounded-full animate-spin"></div>
                  <p className="text-[10px] tracking-widest text-neutral-500 uppercase">Analyzing Material...</p>
                </div>
              )}

              <div className="min-w-[5vw] sm:min-w-[30vw] h-full shrink-0" />
            </div>
          )}
          {activeTab === 'explore' && thumbEntries.length > 0 && (
            <div
              className="fixed left-1/2 -translate-x-1/2 z-50 w-40 sm:w-52 pointer-events-auto"
              style={{ bottom: 'max(calc(env(safe-area-inset-bottom, 0px) + 8.25rem), 9rem)' }}
            >
              <div
                ref={thumbStripRef}
                className="w-full overflow-x-auto no-scrollbar"
                style={{
                  WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 12%, black 88%, transparent 100%)',
                  maskImage: 'linear-gradient(to right, transparent 0%, black 12%, black 88%, transparent 100%)'
                }}
              >
                <div className="flex items-center space-x-2 min-w-max">
                  <div className="w-20 sm:w-24 h-1 shrink-0" />
                  {thumbEntries.map((entry, idx) => {
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => {
                          galleryEntryRefs.current[entry.sourceIndex]?.scrollIntoView({
                            behavior: 'smooth',
                            block: 'nearest',
                            inline: 'center'
                          });
                        }}
                        className={`overflow-hidden border bg-white/70 transition-all duration-200 ${
                          idx === activeThumbIndex
                            ? 'w-8 h-8 rounded-md border-neutral-400 scale-110'
                            : 'w-6 h-6 rounded-sm border-neutral-200'
                        }`}
                      >
                        <img src={entry.url} alt="" className="w-full h-full object-cover" />
                      </button>
                    );
                  })}
                  <div className="w-20 sm:w-24 h-1 shrink-0" />
                </div>
              </div>
            </div>
          )}
        </div>

        {interpretingItem && (
          <InterpretationModal
            item={interpretingItem}
            onClose={() => setInterpretingItem(null)}
            onUpdateConversation={updateItemConversation}
            onUpdateAnnotations={(ans) => updateItemAnnotations(interpretingItem.id, ans)}
            onUpdateMetadata={updateItemMetadata}
            onDelete={handleDeleteItem}
            sessionId={visit.id}
            allVisitItems={interpretingItem.allVisitItems}
            onNavigate={handleNavigateInterpretation}
          />
        )}

        {exhibitionContext && (
          <ExhibitionHall
            items={items.filter(i => exhibitionContext.visitId ? i.visitId === exhibitionContext.visitId : exhibitionContext.items.map(ci => ci.id).includes(i.id))}
            conversation={visit.globalConversation}
            onClose={() => setExhibitionContext(null)}
            onUpdateConversation={(msgs) => setVisit(prev => ({ ...prev, globalConversation: [...prev.globalConversation, ...msgs] }))}
            onDeleteItem={handleDeleteItem}
            onInterpret={setInterpretingItem}
            initialMessage={exhibitionContext.initialMessage}
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

        {activeTab === 'explore' && (
          <Controls
            onUpload={handleFileUpload}
            isAnalyzing={isAnalyzing}
            isVisitActive={visit.active}
            onToggleVisit={visit.active ? handleEndVisit : handleStartVisit}
          />
        )}

      </div>
    </GoogleOAuthProvider>
  );
};

export default App;
