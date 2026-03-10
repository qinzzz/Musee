
import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { Message, Annotation } from '../types';
import { chatWithArtwork, chatWithArtworkStream, base64ToFile, getTagExplanation, suggestTopics, updateArtwork } from '../apiService';
import pencilIcon from '../assets/pencil-line.svg';

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
  onUpdateMetadata?: (id: string, updates: { artistName?: string; artworkName?: string; date?: string; medium?: string; keywords?: string[] }) => void;
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
        className="text-[10px] tracking-wide text-neutral-500 bg-neutral-50 px-3 py-1 rounded-full border border-neutral-100 hover:bg-neutral-100 hover:text-neutral-700 transition-colors cursor-default whitespace-nowrap"
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


const InterpretationModal: React.FC<Props> = ({ item, onClose, onUpdateConversation, onUpdateAnnotations, onUpdateMetadata, onDelete, sessionId, allVisitItems, onNavigate }) => {
  const [messages, setMessages] = useState<Message[]>(item.conversation);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [newAnnotationPos, setNewAnnotationPos] = useState<{ x: number, y: number } | null>(null);
  const [annotationInput, setAnnotationInput] = useState('');
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [imageAspect, setImageAspect] = useState<number>(1);
  const [suggestedTopics, setSuggestedTopics] = useState<string[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);
  // rightMode: 'metadata' shows analysis info, 'chat' shows conversation
  const [rightMode, setRightMode] = useState<'metadata' | 'chat'>('metadata');
  const [isWaitingForFirstChunk, setIsWaitingForFirstChunk] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Inline editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editValues, setEditValues] = useState({
    artist: item.artistName || '',
    title: item.artworkName || '',
    date: item.date || '',
    medium: item.medium || '',
  });
  const [editTags, setEditTags] = useState<string[]>(item.keywords || []);
  const [tagInput, setTagInput] = useState('');
  const [isSavingField, setIsSavingField] = useState(false);
  const originalValuesRef = useRef(editValues);
  const originalTagsRef = useRef<string[]>(item.keywords || []);
  const firstEditInputRef = useRef<HTMLInputElement>(null);

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
      if (dateStr.includes('T')) {
        const dt = new Date(dateStr);
        if (!isNaN(dt.getTime())) {
          return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        }
      }
      if (dateStr.includes(', ')) {
        const parts = dateStr.split(', ');
        if (parts.length >= 2) {
          if (parts.length >= 3 && parts[2].match(/\d{2}:\d{2}/)) {
            return `${parts[0]}, ${parts[1]}`;
          }
          return `${parts[0]}, ${parts[1]}`;
        }
      }
      if (dateStr.includes(' ')) {
        const parts = dateStr.split(' ');
        if (parts[0].includes('-')) {
          const dt = new Date(dateStr);
          if (!isNaN(dt.getTime())) {
            return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          }
        }
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

  // Custom markdown component to make bold/italic text clickable (Google search)
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

  // Load image to get aspect ratio; open modal even if image fails
  useEffect(() => {
    setImageError(false);
    const img = new Image();
    img.onload = () => {
      setImageAspect(img.width / img.height);
      setImageLoaded(true);
    };
    img.onerror = () => {
      setImageError(true);
      setImageLoaded(true); // unblock modal render
    };
    img.src = item.url;
  }, [item.url]);

  // Sync internal state when navigating between items in a session
  useEffect(() => {
    setMessages(item.conversation || []);
    setSuggestedTopics([]);
    setRightMode('metadata'); // Reset to metadata view for the new piece
    setIsEditing(false);
    setTagInput('');
    const vals = {
      artist: item.artistName || '',
      title: item.artworkName || '',
      date: item.date || '',
      medium: item.medium || '',
    };
    const tags = item.keywords || [];
    setEditValues(vals);
    setEditTags(tags);
    originalValuesRef.current = vals;
    originalTagsRef.current = tags;
  }, [item.id]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, suggestedTopics]);

  // Parse streaming JSON to extract fields progressively during analysis
  const streamingFields = useMemo(() => {
    if (!item.isAnalyzing || !item.streamingText) return null;
    const text = item.streamingText;
    const jsonStart = text.indexOf('{');
    if (jsonStart === -1) return null;
    const json = text.substring(jsonStart);
    const result: Record<string, string> = {};

    const fields = ['artist', 'title', 'date', 'medium'];
    for (const field of fields) {
      const match = json.match(new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
      if (match) result[field] = match[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
    }

    const descMatch = json.match(/"description"\s*:\s*"/);
    if (descMatch && descMatch.index !== undefined) {
      const afterQuote = descMatch.index + descMatch[0].length;
      let desc = json.substring(afterQuote);
      let i = 0;
      while (i < desc.length) {
        if (desc[i] === '\\') { i += 2; }
        else if (desc[i] === '"') { desc = desc.substring(0, i); break; }
        else { i++; }
      }
      result.description = desc.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
    }

    return Object.keys(result).length > 0 ? result : null;
  }, [item.isAnalyzing, item.streamingText]);

  const displayArtist = streamingFields?.artist || item.artistName;
  const displayTitle = streamingFields?.title || item.artworkName;
  const displayDate = streamingFields?.date || item.date;
  const displayMedium = streamingFields?.medium || item.medium;
  const displayDescription = streamingFields?.description || item.description;

  // Focus first input when entering edit mode
  useEffect(() => {
    if (isEditing) firstEditInputRef.current?.focus();
  }, [isEditing]);

  const startEditing = () => {
    if (item.isAnalyzing || !item.artworkId) return;
    originalValuesRef.current = { ...editValues };
    originalTagsRef.current = [...editTags];
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setEditValues(originalValuesRef.current);
    setEditTags(originalTagsRef.current);
    setTagInput('');
    setIsEditing(false);
  };

  const saveAllFields = async () => {
    if (!item.artworkId || isSavingField) return;
    const finalTags = tagInput.trim()
      ? [...editTags, tagInput.trim().startsWith('#') ? tagInput.trim() : `#${tagInput.trim()}`]
      : editTags;
    setTagInput('');
    setEditTags(finalTags);
    setIsEditing(false);
    const orig = originalValuesRef.current;
    const origTags = originalTagsRef.current;
    const apiUpdates: Record<string, any> = {};
    if (editValues.artist.trim() !== orig.artist) apiUpdates.artistName = editValues.artist.trim();
    if (editValues.title.trim() !== orig.title) apiUpdates.artworkName = editValues.title.trim();
    if (editValues.date.trim() !== orig.date) apiUpdates.date = editValues.date.trim();
    if (editValues.medium.trim() !== orig.medium) apiUpdates.medium = editValues.medium.trim();
    const tagsChanged = JSON.stringify(finalTags.slice().sort()) !== JSON.stringify(origTags.slice().sort());
    if (tagsChanged) apiUpdates.tags = finalTags.join(',');
    if (Object.keys(apiUpdates).length === 0) return;
    try {
      setIsSavingField(true);
      await updateArtwork(item.artworkId, apiUpdates);
      const metaUpdate: any = { ...apiUpdates };
      if (tagsChanged) metaUpdate.keywords = finalTags;
      onUpdateMetadata?.(item.id, metaUpdate);
    } catch (e) {
      console.error('Failed to save metadata:', e);
    } finally {
      setIsSavingField(false);
    }
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); saveAllFields(); }
    if (e.key === 'Escape') { cancelEditing(); }
  };

  const fetchSuggestions = async (currentMessages: Message[]) => {
    if (!item.artistName || !item.artworkName) return;
    setIsSuggesting(true);
    setSuggestedTopics([]);
    try {
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
    setRightMode('chat'); // Switch right panel to chat on send
    const userMsg: Message = { role: 'user', text };
    setMessages(prev => [...prev, userMsg]);
    setSuggestedTopics([]);
    setInput('');
    setIsTyping(true);

    try {
      let imageFile: File | undefined;
      if (item.url.startsWith('data:')) {
        imageFile = base64ToFile(item.url, 'artwork.jpg');
      } else if (item.url.startsWith('blob:')) {
        try {
          const response = await fetch(item.url);
          const blob = await response.blob();
          imageFile = new File([blob], 'artwork.jpg', { type: blob.type || 'image/jpeg' });
        } catch (e) {
          console.error('Failed to fetch blob URL:', e);
        }
      }

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

  // Calculate modal dimensions based on screen size
  const getModalStyle = () => {
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const isMobile = viewportWidth < 640;
    const mobileHeight = 'calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 1rem)';

    if (!imageLoaded) {
      if (isMobile) return { width: '96vw', height: mobileHeight, maxHeight: mobileHeight };
      return { width: '600px', height: '400px' };
    }

    if (isMobile) {
      return { width: '96vw', height: mobileHeight, maxHeight: mobileHeight };
    }

    // Desktop: wide layout
    const maxHeight = viewportWidth > 1200 ? 92 : 88; // vh
    const maxWidth = 94; // vw
    const totalWidth = (maxWidth / 100) * viewportWidth;
    const totalHeight = (maxHeight / 100) * viewportHeight;

    return {
      width: `${totalWidth}px`,
      height: `${totalHeight}px`,
      maxWidth: '1800px',
    };
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center overflow-y-auto p-2 sm:p-12"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.5rem)'
      }}
    >
      <div className="absolute inset-0 bg-neutral-900/40 backdrop-blur-xl" onClick={onClose} />

      {/* Loading spinner */}
      {!imageLoaded && (
        <div className="absolute z-10 flex flex-col items-center space-y-4">
          <div className="w-12 h-12 border-t-2 border-neutral-800 rounded-full animate-spin"></div>
          <p className="text-[10px] tracking-widest text-neutral-400 uppercase">Loading...</p>
        </div>
      )}

      <div
        className={`relative bg-white rounded-2xl sm:rounded-[2rem] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-500 transition-all ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
        style={getModalStyle()}
      >
        {/* ── MAIN AREA: left photo panel + right content panel ── */}
        <div className="flex flex-col sm:flex-row flex-1 min-h-0">

          {/* ── LEFT / TOP PANEL: Location + Time + Photo ── */}
          <div
            className="shrink-0 flex flex-col bg-neutral-50 border-b sm:border-b-0 sm:border-r border-neutral-100 sm:w-[44%] min-h-0 h-[42vh] sm:h-auto"
          >
            {/* Location + Time row */}
            {!item.isAnalyzing && (displayLocation || item.photoTime) && (
              <div className="px-4 pt-3 pb-1.5 shrink-0 flex flex-wrap gap-x-5 gap-y-0.5 border-b border-neutral-100/60">
                {displayLocation && (
                  <div className="flex items-center gap-1.5 min-w-0">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-400 shrink-0">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                    </svg>
                    <span className="text-[11px] text-neutral-500 truncate">{displayLocation}</span>
                  </div>
                )}
                {item.photoTime && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-400">
                      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                    </svg>
                    <span className="text-[11px] text-neutral-500">{formatDisplayDate(item.photoTime)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Photo — takes remaining space */}
            <div className="flex-1 relative flex items-center justify-center p-3 sm:p-5 cursor-crosshair min-h-0 overflow-hidden">
              {imageError ? (
                <div className="flex flex-col items-center justify-center gap-3 text-neutral-300 select-none">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                  </svg>
                  <p className="text-[10px] tracking-[0.2em] uppercase">Image unavailable</p>
                </div>
              ) : (
                <img
                  ref={imageRef}
                  src={item.url}
                  onClick={handleImageClick}
                  className="max-w-full max-h-full object-contain shadow-xl rounded-lg"
                  alt="Interpretation target"
                />
              )}

              {/* Analyzing overlay badge on photo */}
              {item.isAnalyzing && (
                <div className="absolute inset-0 flex items-end justify-start p-3 pointer-events-none">
                  <div className="flex items-center gap-2 bg-white/85 backdrop-blur-sm rounded-full px-3 py-1.5 shadow-sm">
                    <div className="relative w-3 h-3 shrink-0">
                      <div className="absolute inset-0 border-[1.5px] border-neutral-200 rounded-full"></div>
                      <div className="absolute inset-0 border-t-[1.5px] border-neutral-800 rounded-full animate-spin"></div>
                    </div>
                    <span className="text-[9px] tracking-[0.2em] uppercase text-neutral-500 font-bold">Analyzing</span>
                  </div>
                </div>
              )}

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
            </div>
          </div>

          {/* ── RIGHT PANEL: Analysis Metadata OR Curator Dialogue ── */}
          <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-white">

            {/* Right panel header */}
            <div className="px-5 py-3 border-b border-neutral-100 flex items-center justify-between shrink-0">
              {/* Left side: mode label / back button */}
              {rightMode === 'chat' ? (
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setRightMode('metadata')}
                    className="text-[9px] tracking-[0.3em] uppercase text-neutral-400 hover:text-neutral-700 transition-colors flex items-center gap-1"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                    Info
                  </button>
                  <div className="w-px h-3 bg-neutral-200" />
                  <span className="text-[9px] tracking-[0.4em] uppercase text-neutral-400 font-bold">Curator Dialogue</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  {item.isAnalyzing && (
                    <div className="relative w-3 h-3 shrink-0">
                      <div className="absolute inset-0 border-[1.5px] border-neutral-100 rounded-full"></div>
                      <div className="absolute inset-0 border-t-[1.5px] border-neutral-800 rounded-full animate-spin"></div>
                    </div>
                  )}
                  <span className="text-[9px] tracking-[0.4em] uppercase text-neutral-400 font-bold">
                    {item.isAnalyzing ? 'Analyzing…' : 'Analysis'}
                  </span>
                </div>
              )}

              {/* Right side: edit / delete / close */}
              <div className="flex items-center gap-3">
                {rightMode === 'metadata' && !item.isAnalyzing && item.artworkId && (
                  isEditing ? (
                    <>
                      <button
                        onClick={cancelEditing}
                        className="text-[9px] tracking-[0.3em] uppercase text-neutral-400 hover:text-neutral-700 transition-colors"
                      >Cancel</button>
                      <button
                        onClick={saveAllFields}
                        disabled={isSavingField}
                        className="text-[9px] tracking-[0.3em] uppercase text-neutral-900 border border-neutral-300 px-3 py-1.5 rounded-full hover:bg-neutral-900 hover:text-white hover:border-neutral-900 transition-all disabled:opacity-40"
                      >{isSavingField ? 'Saving…' : 'Save'}</button>
                    </>
                  ) : (
                    <button
                      onClick={startEditing}
                      className="opacity-40 hover:opacity-80 transition-opacity"
                      title="Edit artwork info"
                    >
                      <img src={pencilIcon} width="15" height="15" alt="Edit" />
                    </button>
                  )
                )}
                {onDelete && !item.isAnalyzing && (
                  <button
                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); onDelete(item.id); }}
                    className="text-neutral-300 hover:text-red-500 transition-colors"
                    title="Remove from Musee"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                  </button>
                )}
                <button onClick={onClose} className="text-neutral-300 hover:text-neutral-900 transition-colors text-lg leading-none">✕</button>
              </div>
            </div>

            {/* Right panel scrollable content */}
            {rightMode === 'metadata' ? (
              <div className="flex-1 overflow-y-auto p-5 sm:p-7 space-y-5 sm:space-y-7 min-h-0">

                {/* Error state */}
                {!item.isAnalyzing && item.streamingText && !item.artistName && (
                  <div className="rounded-xl border border-red-200 bg-red-50/80 p-4">
                    <p className="text-[9px] tracking-[0.3em] uppercase text-red-600 font-bold mb-2">Analysis failed</p>
                    <p className="text-[13px] text-red-800 leading-relaxed">{item.streamingText}</p>
                  </div>
                )}

                {displayArtist && (
                  <div>
                    <p className="text-[9px] tracking-[0.4em] uppercase text-neutral-400 font-bold mb-2">Artist</p>
                    {isEditing ? (
                      <input
                        ref={firstEditInputRef}
                        value={editValues.artist}
                        onChange={e => setEditValues(v => ({ ...v, artist: e.target.value }))}
                        onKeyDown={handleEditKeyDown}
                        className="text-[17px] sm:text-[22px] font-medium text-neutral-900 tracking-tight leading-tight bg-transparent border-b border-neutral-300 outline-none w-full focus:border-neutral-600"
                      />
                    ) : (
                      <p className="text-[17px] sm:text-[22px] font-medium text-neutral-900 tracking-tight leading-tight">
                        {editValues.artist || displayArtist}
                      </p>
                    )}
                  </div>
                )}

                {displayTitle && (
                  <div>
                    <p className="text-[9px] tracking-[0.4em] uppercase text-neutral-400 font-bold mb-2">Title</p>
                    {isEditing ? (
                      <input
                        value={editValues.title}
                        onChange={e => setEditValues(v => ({ ...v, title: e.target.value }))}
                        onKeyDown={handleEditKeyDown}
                        className="text-[15px] sm:text-[19px] font-serif italic text-neutral-700 leading-tight bg-transparent border-b border-neutral-300 outline-none w-full focus:border-neutral-600"
                      />
                    ) : (
                      <p className="text-[15px] sm:text-[19px] font-serif italic text-neutral-700 leading-tight">
                        {editValues.title || displayTitle}
                      </p>
                    )}
                  </div>
                )}

                {(displayDate || displayMedium) && (
                  <div className="flex flex-wrap gap-6 sm:gap-10">
                    {displayDate && (
                      <div>
                        <p className="text-[9px] tracking-[0.4em] uppercase text-neutral-400 mb-1.5 font-bold">Date</p>
                        {isEditing ? (
                          <input
                            value={editValues.date}
                            onChange={e => setEditValues(v => ({ ...v, date: e.target.value }))}
                            onKeyDown={handleEditKeyDown}
                            placeholder="e.g. 1889"
                            className="text-[14px] text-neutral-600 bg-transparent border-b border-neutral-300 outline-none focus:border-neutral-600 w-28"
                          />
                        ) : (
                          <p className="text-[14px] text-neutral-600">
                            {editValues.date ? formatDisplayDate(editValues.date) : formatDisplayDate(displayDate)}
                          </p>
                        )}
                      </div>
                    )}
                    {displayMedium && (
                      <div>
                        <p className="text-[9px] tracking-[0.4em] uppercase text-neutral-400 mb-1.5 font-bold">Medium</p>
                        {isEditing ? (
                          <input
                            value={editValues.medium}
                            onChange={e => setEditValues(v => ({ ...v, medium: e.target.value }))}
                            onKeyDown={handleEditKeyDown}
                            placeholder="e.g. Oil on canvas"
                            className="text-[14px] text-neutral-600 bg-transparent border-b border-neutral-300 outline-none focus:border-neutral-600 w-44"
                          />
                        ) : (
                          <p className="text-[14px] text-neutral-600">{editValues.medium || displayMedium}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {displayDescription && (
                  <div>
                    <p className="text-[9px] tracking-[0.4em] uppercase text-neutral-400 mb-2 font-bold">Analysis</p>
                    <div className="text-[12px] sm:text-[13px] leading-relaxed text-neutral-600 font-serif">
                      <ReactMarkdown components={markdownComponents}>{displayDescription}</ReactMarkdown>
                      {item.isAnalyzing && (
                        <span className="inline-block w-1.5 h-3 bg-neutral-400 animate-pulse ml-0.5"></span>
                      )}
                    </div>
                  </div>
                )}

                {!item.isAnalyzing && (editTags.length > 0 || isEditing) && (
                  <div className="pb-2">
                    <p className="text-[9px] tracking-[0.4em] uppercase text-neutral-400 mb-2 font-bold">Tags</p>
                    {isEditing ? (
                      <div className="flex flex-wrap gap-2 items-center">
                        {editTags.map((tag, idx) => (
                          <span
                            key={idx}
                            className="flex items-center gap-1 text-[10px] tracking-wide text-neutral-500 bg-neutral-50 pl-3 pr-1.5 py-1 rounded-full border border-neutral-200"
                          >
                            {tag}
                            <button
                              onClick={() => setEditTags(prev => prev.filter((_, i) => i !== idx))}
                              className="w-4 h-4 flex items-center justify-center text-neutral-400 hover:text-neutral-700 rounded-full hover:bg-neutral-200 transition-colors"
                              title="Remove tag"
                            >×</button>
                          </span>
                        ))}
                        <input
                          value={tagInput}
                          onChange={e => setTagInput(e.target.value)}
                          onKeyDown={e => {
                            if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
                              e.preventDefault();
                              const newTag = tagInput.trim().startsWith('#') ? tagInput.trim() : `#${tagInput.trim()}`;
                              setEditTags(prev => [...prev, newTag]);
                              setTagInput('');
                            } else if (e.key === 'Escape') {
                              cancelEditing();
                            }
                          }}
                          placeholder="add tag…"
                          className="text-[10px] text-neutral-500 bg-transparent border-b border-neutral-300 outline-none focus:border-neutral-600 min-w-[70px] w-24 py-1"
                        />
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {editTags.map((tag, idx) => (
                          <HoverTag key={idx} tag={tag} artworkId={item.artworkId} />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Suggested explorations — clicking sends and switches to chat */}
                {!item.isAnalyzing && suggestedTopics.length > 0 && (
                  <div className="pt-2 border-t border-neutral-50 animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <p className="text-[8px] tracking-[0.3em] uppercase text-neutral-300 mb-3 font-bold">Suggested Explorations</p>
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
            ) : (
              /* ── CHAT MODE ── */
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6 scroll-smooth min-h-0">
                {messages.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-center opacity-40 py-12">
                    <div className="w-12 h-px bg-neutral-200 mb-6"></div>
                    <p className="text-[11px] text-neutral-400 italic mb-4 font-serif leading-relaxed px-8">
                      The curator awaits your spatial and conceptual queries.
                    </p>
                  </div>
                )}
                {messages.map((m, idx) => (
                  <div key={idx} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] p-3 sm:p-4 text-[13px] leading-relaxed tracking-wide ${m.role === 'user'
                      ? 'bg-neutral-900 text-white rounded-2xl rounded-tr-none'
                      : 'bg-neutral-50 text-neutral-800 rounded-2xl rounded-tl-none font-serif'
                    }`}>
                      {m.text ? (
                        m.role === 'model' ? (
                          <div className="prose prose-sm max-w-none prose-neutral prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5">
                            <ReactMarkdown components={markdownComponents}>{m.text}</ReactMarkdown>
                          </div>
                        ) : m.text
                      ) : (m.role === 'model' && isWaitingForFirstChunk && idx === messages.length - 1 ? (
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
            )}
          </div>
        </div>

        {/* ── BOTTOM: Chat Input (always visible) ── */}
        <div className="shrink-0 border-t border-neutral-100 p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3">
            {/* History toggle — expands conversation on the right panel */}
            <button
              onClick={() => setRightMode(m => m === 'chat' ? 'metadata' : 'chat')}
              title={rightMode === 'chat' ? 'Back to analysis' : 'View conversation'}
              className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center transition-all border ${
                rightMode === 'chat'
                  ? 'bg-neutral-900 border-neutral-900 text-white'
                  : 'border-neutral-200 text-neutral-400 hover:border-neutral-400 hover:text-neutral-700'
              }`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="18 15 12 9 6 15"/>
              </svg>
            </button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !item.isAnalyzing && input.trim()) {
                  handleSend(input);
                }
              }}
              placeholder={item.isAnalyzing ? 'Analyzing artwork…' : 'ask anything…'}
              disabled={item.isAnalyzing}
              className={`flex-1 text-[13px] bg-neutral-50 p-2.5 px-4 sm:p-3 sm:px-5 rounded-full outline-none focus:ring-1 focus:ring-neutral-200 transition-all border border-neutral-100 ${item.isAnalyzing ? 'opacity-50 cursor-not-allowed' : ''}`}
            />
            <button
              onClick={() => { if (!item.isAnalyzing && input.trim()) handleSend(input); }}
              disabled={item.isAnalyzing || !input.trim()}
              className={`w-9 h-9 sm:w-10 sm:h-10 shrink-0 rounded-full bg-neutral-900 text-white flex items-center justify-center shadow-lg transition-all ${item.isAnalyzing || !input.trim() ? 'opacity-40 cursor-not-allowed' : 'hover:scale-110 active:scale-95'}`}
            >
              ↑
            </button>
          </div>
        </div>

        {/* Navigation Arrows (visit sessions) */}
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
