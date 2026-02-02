
import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { Message, Annotation } from '../types';
import { chatWithArtwork, chatWithArtworkStream, base64ToFile, getTagExplanation, suggestTopics } from '../apiService';

interface Props {
  item: {
    url: string;
    id: string;
    conversation: Message[];
    annotations: Annotation[];
    artistName?: string;
    artworkName?: string;
    description?: string;
    keywords?: string[];
    date?: string;
    medium?: string;
    artworkId?: string;  // Backend DB artwork ID for persistent conversations
    isAnalyzing?: boolean;  // Loading state while analyzing
    streamingText?: string;  // Real-time streaming text during analysis
    location?: any;
    photoTime?: string;
    visitId?: string;
  };
  onClose: () => void;
  onUpdateConversation: (id: string, newMessages: Message[]) => void;
  onUpdateAnnotations: (annotations: Annotation[]) => void;
  onDelete?: (id: string) => void;
  sessionId?: string;
  allVisitItems?: any[];
  onNavigate?: (direction: 'prev' | 'next') => void;
}

// Tag component with explanation tooltip on hover
const HoverTag: React.FC<{
  tag: string;
  artworkId?: string;
}> = ({ tag, artworkId }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleMouseEnter = async () => {
    setIsHovered(true);
    if (!explanation && !isLoading) {
      setIsLoading(true);
      try {
        const result = await getTagExplanation(tag, artworkId);
        setExplanation(result);
      } catch (e) {
        console.error('Failed to get tag explanation:', e);
        setExplanation('Unable to load explanation.');
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  return (
    <div className="relative inline-block">
      <span
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="text-[10px] tracking-wide text-neutral-500 bg-neutral-50 px-3 py-1 rounded-full border border-neutral-100 hover:bg-neutral-100 hover:text-neutral-700 transition-colors cursor-default"
      >
        {tag}
      </span>
      {isHovered && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-white rounded-xl shadow-xl border border-neutral-100 p-3 animate-in fade-in zoom-in-95 duration-150 pointer-events-none">
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 rotate-45 w-2 h-2 bg-white border-r border-b border-neutral-100"></div>
          {isLoading ? (
            <div className="flex items-center justify-center py-2">
              <div className="w-4 h-4 border-t-2 border-neutral-400 rounded-full animate-spin"></div>
            </div>
          ) : (
            <p className="text-[11px] leading-relaxed text-neutral-600">{explanation}</p>
          )}
        </div>
      )}
    </div>
  );
};

const InterpretationModal: React.FC<Props> = ({ item, onClose, onUpdateConversation, onUpdateAnnotations, onDelete, sessionId, allVisitItems, onNavigate }) => {
  const [messages, setMessages] = useState<Message[]>(item.conversation);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [newAnnotationPos, setNewAnnotationPos] = useState<{ x: number, y: number } | null>(null);
  const [annotationInput, setAnnotationInput] = useState('');
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageAspect, setImageAspect] = useState<number>(1); // width/height ratio
  const [suggestedTopics, setSuggestedTopics] = useState<string[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [showMetadata, setShowMetadata] = useState(true);
  const [isWaitingForFirstChunk, setIsWaitingForFirstChunk] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const displayLocation = React.useMemo(() => {
    if (!item.location) return null;
    try {
      let data: any = null;
      if (typeof item.location === 'object') {
        data = item.location;
      } else if (typeof item.location === 'string' && item.location.startsWith('{')) {
        data = JSON.parse(item.location);
      }

      if (data) {
        const parts = [data.museum, data.city, data.country].filter(Boolean);
        return parts.length > 0 ? parts.join(', ') : (data.raw || item.location);
      }
      return typeof item.location === 'string' ? item.location : null;
    } catch (e) {
      return typeof item.location === 'string' ? item.location : null;
    }
  }, [item.location]);

  // Helper to format date strings to (Month Day, Year) without time
  const formatDisplayDate = (dateStr: string | null | undefined): string | null => {
    if (!dateStr) return null;
    try {
      // If it has a comma followed by time, split it
      if (dateStr.includes(', ')) {
        const parts = dateStr.split(', ');
        if (parts.length >= 2) {
          // Check if it's "Dec 18, 2024, 8:31 AM"
          if (parts.length >= 3 && parts[2].match(/\d{2}:\d{2}/)) {
            return `${parts[0]}, ${parts[1]}`;
          }
          // If it's already "Dec 18, 2024" return as is
          return `${parts[0]}, ${parts[1]}`;
        }
      }

      // If it has a space followed by time (e.g. ISO result)
      if (dateStr.includes(' ')) {
        const parts = dateStr.split(' ');
        if (parts[0].includes('-')) {
          const dt = new Date(dateStr);
          if (!isNaN(dt.getTime())) {
            return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          }
        }
        // If "Dec 18, 2024 15:30:00"
        if (parts.length >= 3 && parts[1].endsWith(',')) {
          return `${parts[0]} ${parts[1]} ${parts[2]}`;
        }
      }

      const dt = new Date(dateStr);
      if (!isNaN(dt.getTime())) {
        return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      }

      return dateStr;
    } catch (e) {
      return dateStr;
    }
  };

  // Custom markdown component to make bold text clickable (Google search)
  const markdownComponents = {
    strong: ({ children }: { children?: React.ReactNode }) => {
      const text = String(children);
      const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(text)}`;
      return (
        <a
          href={googleSearchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-neutral-800 underline decoration-neutral-300 hover:decoration-neutral-500 hover:text-neutral-900 transition-colors cursor-pointer"
        >
          {children}
        </a>
      );
    },
    em: ({ children }: { children?: React.ReactNode }) => {
      const text = String(children);
      const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(text)}`;
      return (
        <a
          href={googleSearchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="italic text-neutral-700 underline decoration-neutral-200 hover:decoration-neutral-400 transition-colors cursor-pointer"
        >
          {children}
        </a>
      );
    },
    p: ({ children }: { children?: React.ReactNode }) => (
      <span>{children}</span>
    ),
  };

  // Load image to get aspect ratio
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      setImageAspect(img.width / img.height);
      setImageLoaded(true);
    };
    img.src = item.url;
  }, [item.url]);

  // Sync internal state when navigating between items in a session
  useEffect(() => {
    setMessages(item.conversation || []);
    setSuggestedTopics([]); // Reset suggestions for the new item
    setShowMetadata(true); // Default to showing metadata for the new piece
  }, [item.id, item.conversation]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, suggestedTopics]);

  const fetchSuggestions = async (currentMessages: Message[]) => {
    if (!item.artistName || !item.artworkName) return;
    setIsSuggesting(true);
    setSuggestedTopics([]); // Clear existing suggestions immediately
    try {
      // Include the initial description if messages are empty to provide context
      const historyToSuggest = currentMessages.length > 0
        ? currentMessages
        : (item.description ? [{ role: 'model', text: item.description }] as Message[] : []);

      const topics = await suggestTopics(item.artistName, item.artworkName, historyToSuggest);
      setSuggestedTopics(topics);
    } catch (e) {
      console.error('Failed to fetch topics:', e);
    } finally {
      setIsSuggesting(false);
    }
  };

  // Fetch initial suggestions when analysis is complete or when opening an existing item
  useEffect(() => {
    if (!item.isAnalyzing && item.artistName && item.artworkName && suggestedTopics.length === 0) {
      fetchSuggestions(messages);
    }
  }, [item.isAnalyzing, item.artistName, item.artworkName]);

  const handleSend = async (text: string) => {
    if (!text.trim()) return;
    const userMsg: Message = { role: 'user', text };
    setMessages(prev => [...prev, userMsg]);
    setSuggestedTopics([]); // Hide obsolete suggestions immediately
    setInput('');
    setIsTyping(true);

    try {
      // Convert image URL to File for the API
      let imageFile: File | undefined;
      console.log('Image URL type:', item.url.substring(0, 50) + '...');

      if (item.url.startsWith('data:')) {
        imageFile = base64ToFile(item.url, 'artwork.jpg');
        console.log('Created file from base64:', { size: imageFile.size, type: imageFile.type });
      } else if (item.url.startsWith('blob:')) {
        // Handle blob URLs - fetch and convert to File
        try {
          const response = await fetch(item.url);
          const blob = await response.blob();
          imageFile = new File([blob], 'artwork.jpg', { type: blob.type || 'image/jpeg' });
          console.log('Created file from blob:', { size: imageFile.size, type: imageFile.type });
        } catch (e) {
          console.error('Failed to fetch blob URL:', e);
        }
      } else {
        console.log('Unsupported URL type, not sending image');
      }

      // Use artworkId mode if available (DB-backed, reliable)
      // Otherwise fall back to stateless mode with conversation history
      const assistantMsg: Message = { role: 'model', text: '' };
      setMessages(prev => [...prev, assistantMsg]);
      setIsTyping(false);
      setIsWaitingForFirstChunk(true);

      await chatWithArtworkStream(
        text,
        (chunk) => {
          setIsWaitingForFirstChunk(false);
          setMessages(prev => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === 'model') {
              last.text += chunk;
            }
            return next;
          });
        },
        (fullResponse) => {
          setIsWaitingForFirstChunk(false);
          // Final response received - sync local state and update parent
          setMessages(prev => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === 'model') {
              last.text = fullResponse;
            }
            return next;
          });

          const updatedMessages: Message[] = [...messages, userMsg, { role: 'model' as const, text: fullResponse }];
          onUpdateConversation(item.id, [userMsg, { role: 'model', text: fullResponse }]);

          // Fetch new suggestions based on the updated conversation
          fetchSuggestions(updatedMessages);
        },
        (error) => {
          console.error('Chat error:', error);
          const errorMsg: Message = { role: 'model', text: 'Apologies, the architectural dialogue has been interrupted.' };
          setMessages(prev => [...prev, errorMsg]);
          onUpdateConversation(item.id, [userMsg, errorMsg]);
        },
        item.artworkId,
        item.artistName,
        item.artworkName,
        messages,
        imageFile,
        sessionId
      );
    } catch (e) {
      console.error(e);
      setIsTyping(false);
    }
  };

  const handleImageClick = (e: React.MouseEvent) => {
    if (!imageRef.current) return;
    const rect = imageRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setNewAnnotationPos({ x, y });
  };

  const submitAnnotation = () => {
    if (!newAnnotationPos || !annotationInput.trim()) return;
    const newAn: Annotation = {
      id: Math.random().toString(36).substr(2, 9),
      x: newAnnotationPos.x,
      y: newAnnotationPos.y,
      comment: annotationInput,
    };
    onUpdateAnnotations([...item.annotations, newAn]);
    setNewAnnotationPos(null);
    setAnnotationInput('');
  };

  // Calculate modal dimensions based on image aspect ratio and screen size
  const getModalStyle = () => {
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const isMobile = viewportWidth < 640; // sm breakpoint

    if (!imageLoaded) {
      // Loading placeholder - responsive
      if (isMobile) {
        return { width: '95vw', height: '90vh' };
      }
      return { width: '600px', height: '400px' };
    }

    // Mobile: full screen modal with vertical layout
    if (isMobile) {
      return {
        width: '95vw',
        height: '90vh',
      };
    }

    // Desktop: side-by-side layout, 50/50 split
    const maxHeight = viewportWidth > 1200 ? 92 : 88; // vh
    const maxWidth = 94; // vw

    // We target a consistent total width and allow flex-1 to handle the split
    const totalWidth = (maxWidth / 100) * viewportWidth;
    const totalHeight = (maxHeight / 100) * viewportHeight;

    return {
      width: `${totalWidth}px`,
      height: `${totalHeight}px`,
      maxWidth: '1800px' // cap on extremely wide screens
    };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-12">
      <div className="absolute inset-0 bg-neutral-900/40 backdrop-blur-xl" onClick={onClose} />

      {/* Loading spinner */}
      {!imageLoaded && (
        <div className="absolute z-10 flex flex-col items-center space-y-4">
          <div className="w-12 h-12 border-t-2 border-neutral-800 rounded-full animate-spin"></div>
          <p className="text-[10px] tracking-widest text-neutral-400 uppercase">Loading...</p>
        </div>
      )}

      <div
        className={`relative bg-white rounded-2xl sm:rounded-[2rem] shadow-2xl overflow-hidden flex flex-col sm:flex-row animate-in zoom-in-95 duration-500 transition-all ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
        style={getModalStyle()}
      >
        {/* Visual Reference & Annotation Canvas Panel */}
        <div className="h-[45vh] sm:h-auto sm:flex-1 bg-neutral-50 flex items-center justify-center p-4 sm:p-12 overflow-hidden relative group/canvas min-w-0">
          <div className="relative cursor-crosshair w-full h-full flex items-center justify-center">
            <img
              ref={imageRef}
              src={item.url}
              onClick={handleImageClick}
              className="max-w-full max-h-full object-contain shadow-xl rounded-lg"
              alt="Interpretation target"
            />

            {/* Existing Annotations */}
            {item.annotations.map(an => (
              <div
                key={an.id}
                className="absolute group/an -translate-x-1/2 -translate-y-1/2 pointer-events-auto"
                style={{ left: `${an.x}%`, top: `${an.y}%` }}
              >
                <div className="w-6 h-6 rounded-full border border-white bg-white/20 backdrop-blur animate-pulse shadow-lg group-hover/an:scale-150 transition-transform duration-500"></div>
                <div className="absolute left-8 top-1/2 -translate-y-1/2 w-48 opacity-0 group-hover/an:opacity-100 transition-opacity bg-white/90 backdrop-blur p-4 rounded-xl shadow-xl border border-neutral-100 pointer-events-none z-10">
                  <p className="text-[11px] leading-relaxed text-neutral-800 font-serif italic">"{an.comment}"</p>
                </div>
              </div>
            ))}

            {/* New Annotation Indicator */}
            {newAnnotationPos && (
              <div
                className="absolute -translate-x-1/2 -translate-y-1/2 z-20"
                style={{ left: `${newAnnotationPos.x}%`, top: `${newAnnotationPos.y}%` }}
              >
                <div className="w-8 h-8 rounded-full border-2 border-neutral-900 bg-white shadow-xl flex items-center justify-center">
                  <span className="text-xl">+</span>
                </div>
                <div className="absolute top-10 left-1/2 -translate-x-1/2 w-64 bg-white p-4 rounded-2xl shadow-2xl border border-neutral-100">
                  <p className="text-[9px] tracking-[0.3em] uppercase text-neutral-400 mb-2 font-bold">Mark Area of Interest</p>
                  <textarea
                    autoFocus
                    value={annotationInput}
                    onChange={(e) => setAnnotationInput(e.target.value)}
                    placeholder="Capture a structural thought..."
                    className="w-full text-[12px] p-3 bg-neutral-50 rounded-xl outline-none border border-neutral-100 focus:ring-1 focus:ring-neutral-200 resize-none h-20"
                  />
                  <div className="flex justify-end space-x-2 mt-3">
                    <button onClick={() => setNewAnnotationPos(null)} className="text-[10px] uppercase tracking-widest text-neutral-400 p-2 hover:text-neutral-900">Cancel</button>
                    <button onClick={submitAnnotation} className="bg-neutral-900 text-white text-[10px] uppercase tracking-widest px-4 py-2 rounded-full hover:scale-105 transition-transform">Place</button>
                  </div>
                </div>
              </div>
            )}

            {/* Loading/Streaming Overlay for Metadata */}
            {item.isAnalyzing && (
              <div className="absolute top-8 left-8 w-72 bg-white/90 backdrop-blur-md p-8 rounded-2xl shadow-2xl border border-white/20 z-10 hidden sm:block animate-in fade-in duration-500">
                <div className="flex items-center space-x-3 mb-6">
                  <div className="relative shrink-0">
                    <div className="w-6 h-6 border-2 border-neutral-100 rounded-full"></div>
                    <div className="absolute inset-0 w-6 h-6 border-t-2 border-neutral-800 rounded-full animate-spin"></div>
                  </div>
                  <p className="text-[9px] tracking-[0.3em] uppercase text-neutral-400 font-bold">
                    Analyzing Material
                  </p>
                </div>
                {item.streamingText && (
                  <div className="text-[11px] leading-relaxed text-neutral-600 font-serif line-clamp-[12]">
                    <ReactMarkdown components={markdownComponents}>
                      {item.streamingText}
                    </ReactMarkdown>
                    <span className="inline-block w-1.5 h-3 bg-neutral-400 animate-pulse ml-0.5"></span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Info/Label Toggle Button (Switch to Details) - Only visible when metadata is hidden and not analyzing */}
          {!item.isAnalyzing && !showMetadata && (item.artistName || item.artworkName || item.description || item.keywords) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMetadata(true);
              }}
              className="absolute top-8 right-8 z-40 w-16 h-20 sm:w-20 sm:h-28 bg-white rounded-lg shadow-2xl border border-neutral-200 p-3 flex flex-col space-y-2 hover:scale-110 transition-all duration-300 group overflow-hidden"
              title="View Artwork Label"
            >
              <div className="w-1/2 h-1 bg-neutral-200 rounded-full" />
              <div className="w-full h-1 bg-neutral-100 rounded-full" />
              <div className="w-3/4 h-1 bg-neutral-100 rounded-full" />
              <div className="mt-auto flex justify-between items-end">
                <div className="w-2 h-2 bg-neutral-100 rounded-full shrink-0" />
                <div className="text-[6px] tracking-widest text-neutral-300 font-bold uppercase opacity-0 group-hover:opacity-100 transition-opacity">Info</div>
              </div>
              {/* Subtle hover overlay */}
              <div className="absolute inset-0 bg-neutral-500/0 group-hover:bg-neutral-500/5 transition-colors" />
            </button>
          )}

          {/* Metadata Overlay Card - Positioned relative to the left panel (sm:flex-1) */}
          {showMetadata && !item.isAnalyzing && (item.artistName || item.artworkName || item.description || item.keywords) && (
            <div className="absolute inset-0 bg-white/95 backdrop-blur-md p-8 sm:p-12 overflow-y-auto z-30 scrollbar-hide animate-in fade-in duration-500">
              {/* Thumbnail Toggle (Back to Image) */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMetadata(false);
                }}
                className="absolute top-8 right-8 w-16 h-20 sm:w-20 sm:h-28 rounded-lg overflow-hidden border-2 border-white shadow-2xl hover:scale-110 transition-transform active:scale-95 z-50 group"
                title="Back to Artwork"
              >
                <img src={item.url} className="w-full h-full object-cover grayscale-[0.2] group-hover:grayscale-0 transition-all" alt="Back to artwork" />
                <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors flex items-center justify-center">
                  <span className="text-[6px] tracking-widest text-white font-bold uppercase opacity-0 group-hover:opacity-100 transition-opacity">Image</span>
                </div>
              </button>

              <div className="max-w-xl mx-auto space-y-8">
                {/* Location and Date Metadata (Top context) */}
                {(displayLocation || item.photoTime) && (
                  <div className="flex flex-wrap gap-x-12 gap-y-6 pb-8 border-b border-neutral-100">
                    {displayLocation && (
                      <div>
                        <p className="text-[9px] tracking-[0.4em] uppercase text-neutral-400 mb-2 font-bold">Location</p>
                        <p className="text-[14px] font-serif italic text-neutral-800">{displayLocation}</p>
                      </div>
                    )}
                    {item.photoTime && (
                      <div>
                        <p className="text-[9px] tracking-[0.4em] uppercase text-neutral-400 mb-2 font-bold">Photo Taken</p>
                        <p className="text-[14px] font-serif italic text-neutral-800">{formatDisplayDate(item.photoTime)}</p>
                      </div>
                    )}
                    {item.visitId && (
                      <div>
                        <p className="text-[9px] tracking-[0.4em] uppercase text-neutral-400 mb-2 font-bold">Visit</p>
                        <p className="text-[9px] tracking-widest text-emerald-600 font-mono uppercase bg-emerald-50 px-2 py-0.5 rounded">Recorded</p>
                      </div>
                    )}
                  </div>
                )}

                {item.artistName && (
                  <div>
                    <p className="text-[9px] tracking-[0.4em] uppercase text-neutral-400 mb-2 font-bold">Artist</p>
                    <p className="text-[20px] sm:text-[24px] font-medium text-neutral-900 tracking-tight leading-tight">{item.artistName}</p>
                  </div>
                )}
                {item.artworkName && (
                  <div>
                    <p className="text-[9px] tracking-[0.4em] uppercase text-neutral-400 mb-2 font-bold">Title</p>
                    <p className="text-[18px] sm:text-[22px] font-serif italic text-neutral-700 leading-tight">{item.artworkName}</p>
                  </div>
                )}
                {(item.date || item.medium) && (
                  <div className="flex flex-wrap gap-8 sm:gap-12">
                    {item.date && (
                      <div>
                        <p className="text-[9px] tracking-[0.4em] uppercase text-neutral-400 mb-2 font-bold">Date</p>
                        <p className="text-[14px] text-neutral-600">{formatDisplayDate(item.date)}</p>
                      </div>
                    )}
                    {item.medium && (
                      <div>
                        <p className="text-[9px] tracking-[0.4em] uppercase text-neutral-400 mb-2 font-bold">Medium</p>
                        <p className="text-[14px] text-neutral-600">{item.medium}</p>
                      </div>
                    )}
                  </div>
                )}
                {(displayLocation || item.photoTime) && (
                  <div className="flex flex-wrap gap-8 sm:gap-12 pt-2">
                    {displayLocation && (
                      <div>
                        <p className="text-[9px] tracking-[0.4em] uppercase text-neutral-400 mb-2 font-bold">Location</p>
                        <p className="text-[14px] text-neutral-600">{displayLocation}</p>
                      </div>
                    )}
                    {item.photoTime && (
                      <div>
                        <p className="text-[9px] tracking-[0.4em] uppercase text-neutral-400 mb-2 font-bold">Photo Taken</p>
                        <p className="text-[14px] text-neutral-600">{item.photoTime}</p>
                      </div>
                    )}
                  </div>
                )}
                {item.description && (
                  <div>
                    <p className="text-[9px] tracking-[0.4em] uppercase text-neutral-400 mb-2 font-bold">Analysis</p>
                    <div className="text-[13px] sm:text-[14px] leading-relaxed text-neutral-600 font-serif">
                      <ReactMarkdown components={markdownComponents}>
                        {item.description}
                      </ReactMarkdown>
                    </div>
                  </div>
                )}
                {item.keywords && item.keywords.length > 0 && (
                  <div className="pt-2">
                    <p className="text-[9px] tracking-[0.4em] uppercase text-neutral-400 mb-2 font-bold">Tags</p>
                    <div className="flex flex-wrap gap-2">
                      {item.keywords.map((tag, idx) => (
                        <HoverTag
                          key={idx}
                          tag={tag}
                          artworkId={item.artworkId}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Chat Interface - 50% split on desktop */}
        <div className="flex-1 w-full sm:w-1/2 flex flex-col bg-white border-t sm:border-t-0 sm:border-l border-neutral-100 min-w-0 min-h-0">
          <div className="p-4 sm:p-6 border-b border-neutral-50 flex justify-between items-center shrink-0">
            <div className="flex items-center space-x-3">
              <h3 className="text-[9px] sm:text-[10px] tracking-[0.4em] sm:tracking-[0.5em] uppercase text-neutral-400 font-bold">curator dialogue</h3>
            </div>
            <div className="flex items-center space-x-4">
              {onDelete && !item.isAnalyzing && (
                <button
                  onClick={() => onDelete(item.id)}
                  className="text-neutral-300 hover:text-red-500 transition-colors"
                  title="Remove from Musee"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                </button>
              )}
              <button onClick={onClose} className="text-neutral-300 hover:text-neutral-900 transition-colors text-xl">✕</button>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6 scroll-smooth min-h-0">
            {!item.isAnalyzing && messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-40 py-12">
                <div className="w-12 h-px bg-neutral-200 mb-6 font-serif tracking-[0.4em]">...</div>
                <p className="text-[11px] text-neutral-400 italic mb-4 font-serif leading-relaxed px-8">
                  The curator awaits your spatial and conceptual queries.
                </p>
              </div>
            )}
            {messages.map((m, idx) => (
              <div key={idx} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] p-4 text-[13px] leading-relaxed tracking-wide ${m.role === 'user'
                  ? 'bg-neutral-900 text-white rounded-2xl rounded-tr-none'
                  : 'bg-neutral-50 text-neutral-800 rounded-2xl rounded-tl-none font-serif'
                  }`}>
                  {m.text || (m.role === 'model' && isWaitingForFirstChunk && idx === messages.length - 1 ? (
                    <div className="flex space-x-1.5 py-1">
                      <div className="w-1.5 h-1.5 bg-neutral-300 rounded-full animate-pulse"></div>
                      <div className="w-1.5 h-1.5 bg-neutral-300 rounded-full animate-pulse delay-75"></div>
                      <div className="w-1.5 h-1.5 bg-neutral-300 rounded-full animate-pulse delay-150"></div>
                    </div>
                  ) : null)}
                </div>
              </div>
            ))}

            {isTyping && !isWaitingForFirstChunk && (
              <div className="flex justify-start px-2">
                <div className="flex space-x-1.5 py-4">
                  <div className="w-1.5 h-1.5 bg-neutral-200 rounded-full animate-bounce"></div>
                  <div className="w-1.5 h-1.5 bg-neutral-200 rounded-full animate-bounce delay-100"></div>
                  <div className="w-1.5 h-1.5 bg-neutral-200 rounded-full animate-bounce delay-200"></div>
                </div>
              </div>
            )}

            {/* Suggested Topics Chips */}
            {!item.isAnalyzing && suggestedTopics.length > 0 && !isTyping && (
              <div className="pt-2 animate-in fade-in slide-in-from-bottom-2 duration-500">
                <p className="text-[8px] tracking-[0.3em] uppercase text-neutral-300 mb-3 font-bold px-1">Suggested Explorations</p>
                <div className="flex flex-wrap gap-2">
                  {suggestedTopics.map((topic, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSend(topic)}
                      className="text-[11px] text-neutral-600 bg-white border border-neutral-100 px-4 py-2 rounded-full hover:border-neutral-300 hover:text-neutral-900 hover:shadow-sm transition-all text-left"
                    >
                      {topic}
                    </button>
                  ))}
                  <button
                    onClick={() => fetchSuggestions(messages)}
                    disabled={isSuggesting}
                    className="text-[11px] text-neutral-400 p-2 hover:text-neutral-900 transition-colors disabled:opacity-30"
                    title="Suggest more topics"
                  >
                    {isSuggesting ? '...' : '↺'}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="p-6 border-t border-neutral-50">
            <div className="flex items-center space-x-4">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !item.isAnalyzing && handleSend(input)}
                placeholder={item.isAnalyzing ? "Analyzing artwork..." : "ask anything..."}
                disabled={item.isAnalyzing}
                className={`flex-1 text-[13px] bg-neutral-50 p-3 px-5 rounded-full outline-none focus:ring-1 focus:ring-neutral-200 transition-all border border-neutral-100 ${item.isAnalyzing ? 'opacity-50 cursor-not-allowed' : ''}`}
              />
              <button
                onClick={() => handleSend(input)}
                disabled={item.isAnalyzing}
                className={`w-10 h-10 rounded-full bg-neutral-900 text-white flex items-center justify-center transition-transform shadow-lg ${item.isAnalyzing ? 'opacity-50 cursor-not-allowed' : 'hover:scale-110 active:scale-95'}`}
              >
                ↑
              </button>
            </div>
          </div>
        </div>

        {/* Navigation Arrows */}
        {allVisitItems && allVisitItems.length > 1 && onNavigate && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col items-center space-y-2 z-50 pointer-events-none">
            <button
              onClick={() => onNavigate('prev')}
              className="w-12 h-12 rounded-full bg-neutral-900/80 backdrop-blur-md border border-white/20 text-white flex flex-col items-center justify-center hover:bg-neutral-900 transition-all hover:scale-110 group pointer-events-auto shadow-2xl"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15" /></svg>
              <span className="absolute right-16 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap text-[8px] uppercase tracking-[0.3em] font-bold bg-neutral-900 text-white px-3 py-1.5 rounded-full shadow-2xl">Previous Piece</span>
            </button>

            <div className="bg-emerald-50/90 backdrop-blur-sm px-3 py-1.5 rounded-full border border-emerald-100 shadow-sm pointer-events-auto">
              <span className="text-[9px] font-mono text-emerald-600 tracking-[0.2em] font-bold whitespace-nowrap">
                PIECE {allVisitItems.findIndex(i => i.id === item.id) + 1}/{allVisitItems.length}
              </span>
            </div>

            <button
              onClick={() => onNavigate('next')}
              className="w-12 h-12 rounded-full bg-neutral-900/80 backdrop-blur-md border border-white/20 text-white flex flex-col items-center justify-center hover:bg-neutral-900 transition-all hover:scale-110 group pointer-events-auto shadow-2xl"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
              <span className="absolute right-16 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap text-[8px] uppercase tracking-[0.3em] font-bold bg-neutral-900 text-white px-3 py-1.5 rounded-full shadow-2xl">Next Piece</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default InterpretationModal;
