
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { GalleryItem, ViewMode, NeighborItem, Message, Visit, TagCoordinate, Annotation } from './types';
import { analyzeArtworkStream, analyzeArtwork, ArtworkAnalysisResult, StreamingMetrics, getOrCreateUserId, fetchUserArtworks, getBaseDomain, resolveImageUrl, deleteArtwork } from './apiService';
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
    artworkId?: string,
    isAnalyzing?: boolean,
    streamingText?: string
  } | null>(null);
  const [exhibitionContext, setExhibitionContext] = useState<{ items: GalleryItem[], visitId?: string } | null>(null);
  const [neighborProximity, setNeighborProximity] = useState(0);

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
              timestamp: item.created_at ? new Date(item.created_at).getTime() : Date.now(),
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

    items.forEach(item => {
      const isFromFinishedVisit = item.visitId && (!visit.active || visit.id !== item.visitId);
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
  }, [items, visit]);

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

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    console.log('handleFileUpload called');
    const files = Array.from(event.target.files || []);
    console.log('Files selected:', files.length);
    if (files.length === 0) return;

    // Reset input so the same file can be selected again
    event.target.value = '';

    // Process each file
    files.forEach(async (file) => {
      console.log('Processing file:', file.name, file.size, 'bytes');

      const newItemId = Math.random().toString(36).substring(2, 11);

      try {
        // Read file as base64 for immediate display in corridor
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        // Add placeholder item to exhibition immediately
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
          isAnalyzing: true
        };

        setItems(prev => [...prev, placeholderItem]);
        if (visit.active) setVisit(prev => ({ ...prev, itemIds: [...prev.itemIds, newItemId] }));

        // Call the non-streaming API for batch processing
        console.log('Starting analysis for file:', file.name);
        const analysis = await analyzeArtwork(file, USER_ID);
        console.log('Analysis complete for:', file.name, analysis);

        // Convert tags array to keywords format (with #)
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

        // Resolve backend URL for the corrected image
        const finalUrl = resolveImageUrl(analysis.photo_uri) || base64;

        // Update the item in the gallery with final results
        setItems(prev => prev.map(item => item.id === newItemId ? {
          ...item,
          url: finalUrl,
          keywords: keywords,
          artistName: analysis.artist_name,
          artworkName: analysis.artwork_name,
          description: parseAnalysis(analysis.description),
          artworkId: analysis.artwork_id,
          isAnalyzing: false
        } : item));

      } catch (error) {
        console.error(`Failed to analyze ${file.name}:`, error);
        // Remove 'isAnalyzing' flag even on error so it doesn't spin forever
        setItems(prev => prev.map(item => {
          if (item.id === newItemId) {
            return { ...item, isAnalyzing: false };
          }
          return item;
        }));
      }
    });

    // Scroll to the end of the corridor to see new items
    setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTo({
          left: scrollRef.current.scrollWidth,
          behavior: 'smooth'
        });
      }
    }, 100);
  };

  const updateItemConversation = (id: string, newMessages: Message[]) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, conversation: [...item.conversation, ...newMessages] } : item));
  };

  const updateItemAnnotations = (id: string, annotations: Annotation[]) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, annotations } : item));
    if (interpretingItem?.id === id) setInterpretingItem(prev => prev ? { ...prev, annotations } : null);
  };

  const handleDeleteItem = async (id: string) => {
    if (!window.confirm("Are you sure you want to remove this piece from the Musee? This will permanently delete the analysis and conversation history.")) return;

    try {
      // Find the item to get its artworkId if it exists
      const itemToDelete = items.find(item => item.id === id);
      if (itemToDelete?.artworkId) {
        await deleteArtwork(itemToDelete.artworkId);
      }

      // Remove from local items state
      setItems(prev => prev.filter(item => item.id !== id));

      // If it's being interpreted, close the modal
      if (interpretingItem?.id === id) {
        setInterpretingItem(null);
      }

      console.log(`Successfully deleted artwork: ${id}`);
    } catch (error) {
      console.error("Failed to delete artwork:", error);
      alert("Encountered an error while attempting to remove this piece. Please try again.");
    }
  };

  if (showEntrance) {
    return (
      <div className="fixed inset-0 bg-neutral-900 flex flex-col items-center justify-center text-white z-50 transition-opacity duration-1000" onClick={() => setShowEntrance(false)}>
        <h1 className="text-4xl font-extralight tracking-[0.4em] mb-4 uppercase animate-pulse">The Entrance</h1>
        <p className="text-neutral-400 font-light tracking-widest text-sm">TAP TO CROSS THE THRESHOLD</p>
        <div className="mt-12 w-px h-24 bg-white/20 animate-bounce"></div>
      </div>
    );
  }

  const isGalleryEmpty = items.length === 0 && !isAnalyzing;

  return (
    <div className="relative w-screen h-screen bg-[#fdfdfd] overflow-hidden flex flex-col transition-colors duration-1000">

      <div
        className="absolute inset-0 z-0 pointer-events-none transition-opacity duration-1000 ease-out"
        style={{
          opacity: neighborProximity,
          background: `radial-gradient(circle at 80% 50%, #1a1a1a 0%, #0a0a0a 100%)`,
        }}
      >
        <div className="absolute inset-0 backdrop-blur-[10px] bg-black/40" />
      </div>

      {visit.active && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 z-40 bg-neutral-900 text-white px-6 py-2 rounded-full text-[9px] tracking-[0.3em] uppercase flex items-center space-x-4 animate-in slide-in-from-top-4 shadow-2xl">
          <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span>
          <span>Exhibition in Progress: {visit.itemIds.length} Pieces</span>
          <button onClick={() => setExhibitionContext({ items: items.filter(i => visit.itemIds.includes(i.id)) })} className="ml-4 border-l border-white/20 pl-4 hover:text-emerald-400 transition-colors">Consult Exhibition Hall</button>
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
                className={`snap-center shrink-0 transition-all duration-500 ${visit.active && !visit.itemIds.includes(entry.item.id) ? 'opacity-30 grayscale' : 'opacity-100'}`}
              >
                <GalleryCard
                  item={entry.item}
                  onInterpret={() => setInterpretingItem({ url: entry.item.url, id: entry.item.id, conversation: entry.item.conversation, annotations: entry.item.annotations, artistName: entry.item.artistName, artworkName: entry.item.artworkName, description: entry.item.description, keywords: entry.item.keywords, artworkId: entry.item.artworkId })}
                  onDelete={() => handleDeleteItem(entry.item.id)}
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
                  onOpenExhibition={(stackItems) => setExhibitionContext({ items: stackItems, visitId: entry.visitId })}
                  onDeleteItem={handleDeleteItem}
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
        />
      )}

      {exhibitionContext && (
        <ExhibitionHall
          items={items.filter(i => exhibitionContext.visitId ? i.visitId === exhibitionContext.visitId : exhibitionContext.items.map(ci => ci.id).includes(i.id))}
          conversation={visit.globalConversation}
          onClose={() => setExhibitionContext(null)}
          onUpdateConversation={(msgs) => setVisit(prev => ({ ...prev, globalConversation: [...prev.globalConversation, ...msgs] }))}
          onDeleteItem={handleDeleteItem}
        />
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
  );
};

export default App;
