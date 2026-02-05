import React, { useState, useRef, useMemo, useEffect } from 'react';
import { GalleryItem, ViewMode, NeighborItem, Message, Visit, TagCoordinate, Annotation } from './types';
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
import TopographyView from './components/TopographyView';
import NeighborSection from './components/NeighborSection';
import Controls from './components/Controls';
import InterpretationModal from './components/InterpretationModal';
import ExhibitionHall from './components/ExhibitionHall';
import EmptyWall from './components/EmptyWall';

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
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.CORRIDOR);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showEntrance, setShowEntrance] = useState(true);
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
  const [exhibitionContext, setExhibitionContext] = useState<{ items: GalleryItem[], visitId?: string } | null>(null);
  const [neighborProximity, setNeighborProximity] = useState(0);
  const [currentUser, setCurrentUser] = useState<any>(getCurrentUser());
  const [filteredVisitId, setFilteredVisitId] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ id: string, type: 'item' | 'session' } | null>(null);

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
  const lastItemRef = useRef<HTMLDivElement>(null);

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

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    const maxScroll = scrollWidth - clientWidth;
    if (maxScroll <= 0) return;
    const progress = scrollLeft / maxScroll;
    // Proximal glow starts feeling stronger as we reach the neighbor section
    const proximity = Math.max(0, (progress - 0.7) / 0.3);
    setNeighborProximity(proximity);
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

  const getCurrentLocation = async (): Promise<{ latitude: number, longitude: number } | undefined> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(undefined);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          resolve({ latitude, longitude });
        },
        (error) => {
          console.warn('Geolocation error:', error);
          resolve(undefined);
        },
        { timeout: 10000, enableHighAccuracy: false }
      );
    });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    console.log('handleFileUpload called');
    const files = Array.from(event.target.files || []);
    console.log('Files selected:', files.length);
    if (files.length === 0) return;

    // Reset input so the same file can be selected again
    event.target.value = '';

    // Single file upload: Open modal immediately and stream analysis
    if (files.length === 1) {
      const file = files[0];
      const newItemId = Math.random().toString(36).substring(2, 11);

      // Get location coordinates
      const coords = await getCurrentLocation();
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

        setItems(prev => [...prev, placeholderItem]);
        if (visit.active) setVisit(prev => ({ ...prev, itemIds: [...prev.itemIds, newItemId] }));

        // Open modal immediately
        setInterpretingItem({
          ...placeholderItem,
          visitId: visit.active ? visit.id : undefined,
          allVisitItems: visit.active
            ? [...items, placeholderItem].filter(i => i.visitId === visit.id || visit.itemIds.includes(i.id) || i.id === newItemId)
            : undefined,
          streamingText: 'Initializing analysis...'
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

            const finalUrl = resolveImageUrl(analysis.photo_uri) || base64;

            const finalItemUpdates = {
              url: finalUrl,
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
            const errorUpdates = { isAnalyzing: false, streamingText: 'Analysis interrupted. Please try again.' };
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
      // Get location once for the batch
      const coords = await getCurrentLocation();
      const photoTime = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

      files.forEach(async (file) => {
        console.log('Processing batch file:', file.name);
        const newItemId = Math.random().toString(36).substring(2, 11);

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

          setItems(prev => [...prev, placeholderItem]);
          if (visit.active) setVisit(prev => ({ ...prev, itemIds: [...prev.itemIds, newItemId] }));

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

          const finalUrl = resolveImageUrl(analysis.photo_uri) || base64;

          setItems(prev => prev.map(item => item.id === newItemId ? {
            ...item,
            url: finalUrl,
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

  if (showEntrance) {
    return (
      <div className="fixed inset-0 bg-neutral-900 flex flex-col items-center justify-center text-white z-50 transition-opacity duration-1000" onClick={() => setShowEntrance(false)}>
        <h1 className="text-4xl font-extralight tracking-[0.4em] mb-4 uppercase text-center">
          The Entrance <br />
          <span className="text-sm tracking-[0.2em] font-light text-neutral-400 lowercase italic mt-4 block">
            to your lifelong personal collection
          </span>
        </h1>
        <div className="mt-12 w-px h-24 bg-white/20 animate-bounce"></div>
      </div>
    );
  }

  const isGalleryEmpty = items.length === 0 && !isAnalyzing;

  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || 'YOUR_GOOGLE_CLIENT_ID';

  return (
    <GoogleOAuthProvider clientId={googleClientId}>
      <div className="relative w-screen h-screen bg-[#fdfdfd] overflow-hidden flex flex-col transition-colors duration-1000">
        {/* User Auth Info */}
        <div className="fixed top-8 right-8 z-50 flex items-center space-x-4">
          {currentUser ? (
            <div className="flex items-center space-x-3 bg-white/90 backdrop-blur-md px-4 py-2 rounded-full border border-neutral-200 shadow-xl group">
              <img
                src={currentUser.profile_picture_url}
                alt={currentUser.full_name}
                className="w-6 h-6 rounded-full grayscale group-hover:grayscale-0 transition-all"
              />
              <span className="text-[9px] tracking-[0.2em] uppercase text-neutral-800 font-medium">{currentUser.full_name.split(' ')[0]}</span>
              <button
                onClick={handleLogout}
                className="text-[9px] tracking-[0.2em] uppercase text-neutral-400 hover:text-black transition-colors border-l border-neutral-100 pl-3 ml-1"
              >
                Logout
              </button>
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

        <div
          className="absolute inset-0 z-0 pointer-events-none transition-opacity duration-1000 ease-out"
          style={{
            opacity: neighborProximity,
            background: `radial-gradient(circle at 80% 50%, #1a1a1a 0%, #0a0a0a 100%)`,
          }}
        >
          <div className="absolute inset-0 backdrop-blur-[10px] bg-black/40" />
        </div>

        {/* Unified Session / Filter Bar */}
        {(visit.active || filteredVisitId) && (
          <div className="fixed top-8 left-1/2 -translate-x-1/2 z-40 bg-neutral-900/90 backdrop-blur-md text-white px-6 py-2.5 rounded-full text-[9px] tracking-[0.3em] uppercase flex items-center space-x-6 animate-in slide-in-from-top-4 shadow-2xl border border-white/10">
            <div className="flex items-center space-x-3">
              <span className={`w-1.5 h-1.5 rounded-full ${visit.active && !filteredVisitId ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-500'}`}></span>
              <span className="font-bold">
                {filteredVisitId ? 'Recorded Visit' : 'Exhibition in Progress'}
              </span>
              <span className="text-neutral-500">|</span>
              <span className="text-[8px] opacity-70">
                {items.filter(i => i.visitId === (filteredVisitId || visit.id)).length} Pieces
              </span>
            </div>

            <div className="w-px h-4 bg-white/10" />

            <div className="flex items-center space-x-6">
              <button
                onClick={() => {
                  const sessionItems = items.filter(i => i.visitId === (filteredVisitId || visit.id));
                  setExhibitionContext({ items: sessionItems, visitId: filteredVisitId || (visit.active ? visit.id : undefined) });
                }}
                className="hover:text-emerald-400 transition-all active:scale-95 font-bold tracking-[0.4em]"
              >
                Consult Exhibition Hall
              </button>

              {filteredVisitId && (
                <button
                  onClick={() => {
                    handleResumeVisit(filteredVisitId);
                    setFilteredVisitId(null);
                  }}
                  className="hover:text-emerald-400 transition-all active:scale-95 font-bold tracking-[0.4em] border-l border-white/10 pl-6"
                >
                  Continue the Visit
                </button>
              )}
            </div>

            <button
              onClick={() => {
                if (filteredVisitId) setFilteredVisitId(null);
                else handleEndVisit();
              }}
              className="text-white/40 hover:text-white transition-all active:scale-95"
              title={filteredVisitId ? "Exit Session" : "End Exhibition"}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
        )}

        <div className={`relative z-10 flex-1 transition-all duration-700 ease-in-out ${(viewMode === ViewMode.TOPOGRAPHY || interpretingItem || exhibitionContext) ? 'scale-[0.95] opacity-40 blur-sm' : 'scale-100 opacity-100'}`}>
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
              <div className="min-w-[30vw] h-full shrink-0" />
            )}

            {corridorEntries.map((entry, idx) => {
              const isLast = idx === corridorEntries.length - 1;
              return entry.type === 'item' ? (
                <div
                  key={entry.item.id}
                  ref={isLast ? lastItemRef : null}
                  className="snap-center shrink-0 opacity-100 transition-all duration-500"
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
                  ref={isLast ? lastItemRef : null}
                  className="snap-center shrink-0"
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
              <div className="min-w-[400px] h-[60vh] mx-12 flex flex-col items-center justify-center space-y-4 snap-center shrink-0">
                <div className="w-12 h-12 border-t-2 border-neutral-800 rounded-full animate-spin"></div>
                <p className="text-[10px] tracking-widest text-neutral-500 uppercase">Analyzing Material...</p>
              </div>
            )}

            {/* Always reachable neighbors */}
            <div className="min-w-[15vw] flex items-center justify-center shrink-0">
              <div className={`h-48 w-px transition-colors duration-1000 ${neighborProximity > 0.5 ? 'bg-neutral-800' : 'bg-gradient-to-b from-transparent via-neutral-200 to-transparent'}`} />
            </div>
            <div className="snap-center shrink-0">
              <NeighborSection neighbors={MOCK_NEIGHBORS} onInterpret={(work) => setInterpretingItem({ url: work.url, id: work.id, conversation: work.conversation, annotations: work.annotations })} />
            </div>
            <div className="min-w-[30vw] h-full shrink-0" />
          </div>
        </div>

        {items.length > 0 && viewMode === ViewMode.TOPOGRAPHY && (
          <div className="absolute inset-0 z-20 flex items-center justify-center p-12 bg-white/80 backdrop-blur-md animate-in fade-in duration-500">
            <TopographyView items={items} cachedTagMap={tagPositions} neighborItems={MOCK_NEIGHBORS} onClose={() => setViewMode(ViewMode.CORRIDOR)} />
          </div>
        )}

        {interpretingItem && (
          <InterpretationModal
            item={interpretingItem}
            onClose={() => setInterpretingItem(null)}
            onUpdateConversation={updateItemConversation}
            onUpdateAnnotations={(ans) => updateItemAnnotations(interpretingItem.id, ans)}
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
          />
        )}

        {/* Hidden inputs for programmatic triggering */}
        <input
          ref={albumInputRef}
          type="file"
          className="hidden"
          accept="image/*"
          onChange={handleFileUpload}
          multiple
        />
        <input
          ref={cameraInputRef}
          type="file"
          className="hidden"
          accept="image/*"
          capture="environment"
          onChange={handleFileUpload}
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

        <Controls
          viewMode={viewMode}
          onToggleView={() => setViewMode(prev => prev === ViewMode.CORRIDOR ? ViewMode.TOPOGRAPHY : ViewMode.CORRIDOR)}
          onUpload={handleFileUpload}
          isAnalyzing={isAnalyzing}
          isVisitActive={visit.active}
          onToggleVisit={visit.active ? handleEndVisit : handleStartVisit}
        />
      </div>
    </GoogleOAuthProvider>
  );
};

export default App;
