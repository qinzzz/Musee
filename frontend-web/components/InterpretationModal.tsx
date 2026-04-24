
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import { Message, Album, Annotation, NeighborItem, Visit, GalleryItem } from '../types';
import { chatWithArtwork, chatWithArtworkStream, getTagExplanation, suggestTopics, updateArtwork, base64ToFile, fetchUnlockPoints } from '../apiService';

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
    referenceUrls?: import('../types').ReferenceItem[];
  };
  onClose: () => void;
  onUpdateConversation: (id: string, newMessages: Message[]) => void;
  onUpdateMetadata?: (id: string, updates: { artistName?: string; artworkName?: string; date?: string; medium?: string; keywords?: string[] }) => void;
  sessionId?: string;
  allVisitItems?: any[];
  onNavigate?: (direction: 'prev' | 'next') => void;
  externalMessage?: string;
  onExternalMessageConsumed?: () => void;
  rightMode: 'metadata' | 'chat';
  onRightModeChange: (mode: 'metadata' | 'chat') => void;
  onSwitchMode?: () => void;
  interpretingMode?: 'professional' | 'interactive';
  onRetryHarder?: () => void;
  onReanalyze?: () => Promise<void>;
  onDelete?: () => void;
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


const UnlockPoint: React.FC<{
  pt: { title: string; text: string };
  idx: number;
  c: { dot: string; bg: string; border: string; text: string };
}> = ({ pt, idx, c }) => {
  const [open, setOpen] = useState(false);
  return (
    <div
      style={{ background: open ? c.bg : 'transparent', border: `1px solid ${open ? c.border : '#f0ece8'}`, borderRadius: 10, transition: 'background 200ms, border-color 200ms' }}
    >
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
      >
        <span
          style={{ background: open ? c.dot : '#e8e4df', color: open ? '#fff' : '#aaa', borderRadius: 4, minWidth: 18, height: 18, fontSize: 9, fontFamily: 'monospace', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 200ms, color 200ms' }}
        >
          {idx + 1}
        </span>
        <span style={{ fontSize: 12, fontWeight: 600, color: open ? c.text : '#555', flex: 1, letterSpacing: '0.02em', transition: 'color 200ms' }}>
          {pt.title}
        </span>
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ color: open ? c.dot : '#ccc', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 200ms, color 200ms', flexShrink: 0 }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <p style={{ fontSize: 13, lineHeight: 1.7, color: c.text, fontFamily: 'Georgia, serif', padding: '0 14px 14px 34px', opacity: 0.85 }}>
          {pt.text}
        </p>
      )}
    </div>
  );
};


const InterpretationModal: React.FC<Props> = ({ item, onClose, onUpdateConversation, onUpdateMetadata, sessionId, allVisitItems, onNavigate, externalMessage, onExternalMessageConsumed, rightMode, onRightModeChange, onSwitchMode, interpretingMode, onRetryHarder, onReanalyze, onDelete }) => {
  const [messages, setMessages] = useState<Message[]>(item.conversation);
  const [isTyping, setIsTyping] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [unlockPoints, setUnlockPoints] = useState<Array<{ title: string; text: string }>>([]);
  const [isLoadingUnlock, setIsLoadingUnlock] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [imageAspect, setImageAspect] = useState<number>(1);
  const [suggestedTopics, setSuggestedTopics] = useState<string[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);
const [isWaitingForFirstChunk, setIsWaitingForFirstChunk] = useState(false);
  const [mobileImageHeight, setMobileImageHeight] = useState(-1); // -1 = unset (uses CSS). Set on mount for mobile = 4:3 aspect ratio
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

  useEffect(() => {
    // mobileImageHeight no longer used; mobile image scrolls naturally
  }, [item.id]);

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
    setUnlockPoints([]);
    onRightModeChange('metadata'); // Reset to metadata view for the new piece
    // mobileImageHeight no longer used for mobile
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

  // Fetch unlock points when artist is identified
  useEffect(() => {
    if (!item.isAnalyzing && item.artistName && item.artistName.toLowerCase() !== 'unknown') {
      setIsLoadingUnlock(true);
      fetchUnlockPoints(item.artistName, item.artworkName || '', undefined)
        .then(pts => setUnlockPoints(pts))
        .catch(() => setUnlockPoints([]))
        .finally(() => setIsLoadingUnlock(false));
    }
  }, [item.artistName, item.isAnalyzing]);

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

  // Handle message sent from the external action bar
  useEffect(() => {
    if (externalMessage) {
      handleSend(externalMessage);
      onExternalMessageConsumed?.();
    }
  }, [externalMessage]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = async (text: string) => {
    if (!text.trim()) return;
    onRightModeChange('chat'); // Switch right panel to chat on send
    const userMsg: Message = { role: 'user', text };
    setMessages(prev => [...prev, userMsg]);
    setSuggestedTopics([]);
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

  // Initialize mobile image height on mount
  useEffect(() => {
    if (window.innerWidth < 640) {
      setMobileImageHeight(window.innerWidth * 0.75);
    }
  }, []);

  const handleImagePanelClick = () => { /* no-op; mobile image now scrolls naturally */ };

  const handleToolbarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // desktop-only: clicking toolbar does nothing special
  };

  // Calculate modal dimensions based on screen size
  const getModalStyle = () => {
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const isMobile = viewportWidth < 640;

    if (!imageLoaded) {
      if (isMobile) return { width: '100vw', height: '100dvh' };
      return { width: '600px', height: '400px' };
    }

    if (isMobile) {
      return { width: '100vw', height: '100dvh' };
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
    <>
    <div
      className="fixed inset-0 z-[80] flex items-start sm:items-center justify-center sm:overflow-y-auto sm:p-12"
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
        className={`relative bg-white sm:rounded-[2rem] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-500 transition-all ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
        style={getModalStyle()}
      >
        {/* ── MOBILE HEADER BAR (mobile only): prev/next + close ── */}
        <div className="sm:hidden flex items-center justify-between px-2 shrink-0 bg-white border-b border-neutral-100" style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 0.5rem)', paddingBottom: '0.25rem' }}>
          {/* Left: Prev or spacer */}
          {allVisitItems && allVisitItems.length > 1 && onNavigate ? (
            <button
              onClick={() => onNavigate('prev')}
              className="flex items-center gap-1 text-neutral-500 active:text-neutral-900 transition-colors px-2 py-1.5"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              <span className="text-[10px] tracking-[0.2em] uppercase font-bold">Prev</span>
            </button>
          ) : (
            <div className="w-16" />
          )}

          {/* Center: Back button (replaces ✕) */}
          <button
            onClick={onClose}
            className="flex flex-col items-center justify-center gap-0.5 text-neutral-500 active:text-neutral-900 transition-colors py-1"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="19 12 5 12"/><polyline points="12 19 5 12 12 5"/></svg>
            <span className="text-[9px] tracking-[0.2em] uppercase font-bold">Back</span>
            {allVisitItems && allVisitItems.length > 1 && (
              <span className="text-[8px] font-mono text-neutral-400 tracking-wider">
                {allVisitItems.findIndex(i => i.id === item.id) + 1}/{allVisitItems.length}
              </span>
            )}
          </button>

          {/* Right: Next (if multi-item) + overflow "..." menu */}
          <div className="flex items-center gap-1 min-w-[4rem] justify-end">
            {allVisitItems && allVisitItems.length > 1 && onNavigate && (
              <button
                onClick={() => onNavigate('next')}
                className="flex items-center gap-0.5 text-neutral-500 active:text-neutral-900 transition-colors px-1 py-1.5"
              >
                <span className="text-[10px] tracking-[0.2em] uppercase font-bold">Next</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            )}
            {/* Overflow menu — edit, refresh, retry, delete */}
            {item.artworkId && (
              <div className="relative">
                <button
                  onClick={() => setMoreMenuOpen(o => !o)}
                  className="w-9 h-9 flex items-center justify-center text-neutral-500 active:text-neutral-900 transition-colors"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>
                </button>
                {moreMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-[90]" onClick={() => setMoreMenuOpen(false)} />
                    <div className="absolute top-full right-0 mt-1 z-[91] bg-white border border-neutral-100 rounded-2xl shadow-2xl overflow-hidden min-w-[180px] animate-in fade-in zoom-in-95 duration-150">
                      {!item.isAnalyzing && (
                        <button
                          onClick={() => { setMoreMenuOpen(false); startEditing(); }}
                          className="w-full flex items-center gap-3 px-4 py-3 text-[13px] text-neutral-700 hover:bg-neutral-50 transition-colors text-left"
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                          Edit info
                        </button>
                      )}
                      {onReanalyze && !item.isAnalyzing && (
                        <button
                          onClick={async () => { setMoreMenuOpen(false); setIsReanalyzing(true); try { await onReanalyze(); } catch {} finally { setIsReanalyzing(false); } }}
                          disabled={isReanalyzing}
                          className="w-full flex items-center gap-3 px-4 py-3 text-[13px] text-neutral-700 hover:bg-neutral-50 transition-colors text-left disabled:opacity-40"
                        >
                          <svg width="15" height="15" className={isReanalyzing ? 'animate-spin' : ''} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
                          {isReanalyzing ? 'Refreshing…' : 'Refresh ID'}
                        </button>
                      )}
                      {onRetryHarder && !item.isAnalyzing && (
                        <button
                          onClick={async () => { setMoreMenuOpen(false); setIsRetrying(true); try { await onRetryHarder(); } catch {} finally { setIsRetrying(false); } }}
                          disabled={isRetrying}
                          className="w-full flex items-center gap-3 px-4 py-3 text-[13px] text-neutral-700 hover:bg-neutral-50 transition-colors text-left disabled:opacity-40"
                        >
                          <svg width="15" height="15" className={isRetrying ? 'animate-spin' : ''} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.5 15a9 9 0 1 1-2.2-9.2L23 10"/></svg>
                          {isRetrying ? 'Retrying…' : 'Retry deeper'}
                        </button>
                      )}
                      {onDelete && (
                        <>
                          <div className="h-px bg-neutral-100 mx-3" />
                          <button
                            onClick={() => { setMoreMenuOpen(false); onDelete(); }}
                            className="w-full flex items-center gap-3 px-4 py-3 text-[13px] text-red-500 hover:bg-red-50 transition-colors text-left"
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── MAIN AREA: left photo panel + right content panel ── */}
        <div className="flex flex-col sm:flex-row flex-1 sm:min-h-0 overflow-y-auto sm:overflow-hidden">

          {/* ── LEFT / TOP PANEL: Location + Time + Photo ── */}
          <div
            className="shrink-0 flex flex-col bg-neutral-50 border-b sm:border-b-0 sm:border-r border-neutral-100 sm:w-[44%] sm:h-auto overflow-hidden"
            style={mobileImageHeight >= 0 ? {
              height: `${mobileImageHeight}px`,
              transition: 'height 320ms cubic-bezier(0.4, 0, 0.2, 1)',
              visibility: mobileImageHeight === 0 ? 'hidden' : 'visible',
            } : {}}
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

            {/* Photo — 4:3 center-crop on mobile, contain in panel on desktop */}
            <div className="relative p-3 sm:flex sm:items-center sm:justify-center sm:p-5 sm:flex-1 sm:min-h-0 sm:overflow-hidden">
              {imageError ? (
                <div className="w-full aspect-[4/3] sm:aspect-auto sm:w-auto sm:h-40 flex flex-col items-center justify-center gap-3 text-neutral-300 select-none">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                  </svg>
                  <p className="text-[10px] tracking-[0.2em] uppercase">Image unavailable</p>
                </div>
              ) : (
                <img
                  ref={imageRef}
                  src={item.url}
                  onClick={() => setLightboxOpen(true)}
                  className="w-full aspect-[4/3] object-cover object-center rounded-xl shadow-lg cursor-zoom-in sm:w-auto sm:aspect-auto sm:max-w-full sm:max-h-full sm:object-contain sm:shadow-xl sm:rounded-lg sm:cursor-default"
                  alt="Interpretation target"
                />
              )}


              {/* Analyzing overlay badge on photo */}
              {item.isAnalyzing && interpretingMode !== 'interactive' && (
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

            </div>
          </div>

          {/* ── RIGHT PANEL: Analysis Metadata OR Curator Dialogue ── */}
          <div className="flex flex-col sm:flex-1 sm:min-h-0 min-w-0 bg-white">

            {/* Right panel header — hidden on mobile when not editing (toolbar merged into metadata strip) */}
            <div className={`px-2 py-2 border-b border-neutral-100 items-center justify-between shrink-0 relative ${isEditing ? 'flex' : 'hidden sm:flex'}`} onClick={handleToolbarClick}>
              {/* LEFT: action icons */}
              <div className="flex items-center gap-1">
                {rightMode === 'metadata' && messages.length > 0 && (
                  <button
                    onClick={() => onRightModeChange('chat')}
                    title="View conversation"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-neutral-400 hover:text-neutral-700 hover:bg-neutral-50 transition-all"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                    <span className="text-[9px] tracking-[0.2em] uppercase font-bold">{messages.length}</span>
                  </button>
                )}
                {rightMode === 'metadata' && !item.isAnalyzing && item.artworkId && (
                  (<button
                      onClick={startEditing}
                      title="Edit artwork info"
                      className="w-8 h-9 flex items-center justify-center rounded-full text-neutral-500 hover:text-neutral-700 transition-colors"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
                      </svg>
                    </button>
                  )
                )}

                {isEditing && (
                    <div className="flex items-center gap-2 px-2">
                      <button
                        onClick={cancelEditing}
                        className="text-[9px] tracking-[0.3em] uppercase text-neutral-400 hover:text-neutral-700 transition-colors"
                      >Cancel</button>
                      <button
                        onClick={saveAllFields}
                        disabled={isSavingField}
                        className="text-[9px] tracking-[0.3em] uppercase text-neutral-900 border border-neutral-300 px-3 py-1.5 rounded-full hover:bg-neutral-900 hover:text-white hover:border-neutral-900 transition-all disabled:opacity-40"
                      >{isSavingField ? 'Saving…' : 'Save'}</button>
                    </div>
                )}
              </div>

              {/* RIGHT: mode label + close */}
              <div className="flex items-center gap-1">
                {rightMode === 'chat' && (
                  <>
                    <button
                      onClick={() => onRightModeChange('metadata')}
                      className="text-[9px] tracking-[0.3em] uppercase text-neutral-400 hover:text-neutral-700 transition-colors flex items-center gap-1 px-2 py-1"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                      Info
                    </button>
                    <div className="w-px h-3 bg-neutral-200" />
                  </>
                )}
                <button onClick={onClose} className="hidden sm:flex w-9 h-9 items-center justify-center rounded-full text-neutral-300 hover:text-neutral-900 transition-colors text-lg leading-none">✕</button>
              </div>
            </div>

            {/* Right panel scrollable content */}
            {rightMode === 'metadata' ? (
              <div className="sm:flex-1 sm:overflow-y-auto sm:min-h-0 p-5 sm:p-7 space-y-5 sm:space-y-7 pb-20 sm:pb-7">

                {/* Error state */}
                {!item.isAnalyzing && item.streamingText && !item.artistName && (
                  <div className="rounded-xl border border-red-200 bg-red-50/80 p-4">
                    <p className="text-[9px] tracking-[0.3em] uppercase text-red-600 font-bold mb-2">Analysis failed</p>
                    <p className="text-[13px] text-red-800 leading-relaxed">{item.streamingText}</p>
                    {onRetryHarder && (
                      <button
                        onClick={async () => {
                          if (isRetrying) return;
                          setIsRetrying(true);
                          try { await onRetryHarder(); } catch { /* keep current results */ } finally { setIsRetrying(false); }
                        }}
                        disabled={isRetrying}
                        className="mt-3 flex items-center gap-1.5 text-[9px] tracking-[0.2em] uppercase text-red-700 border border-red-300 px-3 py-1.5 rounded-full hover:bg-red-100 transition-colors disabled:opacity-50"
                      >
                        {isRetrying && <span className="inline-block w-2.5 h-2.5 border-t border-red-500 rounded-full animate-spin shrink-0" />}
                        {isRetrying ? 'Retrying…' : 'Retry with higher reasoning'}
                      </button>
                    )}
                  </div>
                )}

                {/* Metadata — compact horizontal strip in view mode, vertical inputs in edit mode */}
                {isEditing ? (
                  <div className="space-y-4">
                    {displayArtist && (
                      <div>
                        <p className="text-[9px] tracking-[0.4em] uppercase text-neutral-400 font-bold mb-1.5">Artist</p>
                        <input
                          ref={firstEditInputRef}
                          value={editValues.artist}
                          onChange={e => setEditValues(v => ({ ...v, artist: e.target.value }))}
                          onKeyDown={handleEditKeyDown}
                          className="text-[15px] font-medium text-neutral-900 tracking-tight bg-transparent border-b border-neutral-300 outline-none w-full focus:border-neutral-600"
                        />
                      </div>
                    )}
                    {displayTitle && (
                      <div>
                        <p className="text-[9px] tracking-[0.4em] uppercase text-neutral-400 font-bold mb-1.5">Title</p>
                        <input
                          value={editValues.title}
                          onChange={e => setEditValues(v => ({ ...v, title: e.target.value }))}
                          onKeyDown={handleEditKeyDown}
                          className="text-[14px] font-serif italic text-neutral-700 bg-transparent border-b border-neutral-300 outline-none w-full focus:border-neutral-600"
                        />
                      </div>
                    )}
                    <div className="flex gap-6">
                      {displayDate && (
                        <div>
                          <p className="text-[9px] tracking-[0.4em] uppercase text-neutral-400 mb-1.5 font-bold">Date</p>
                          <input
                            value={editValues.date}
                            onChange={e => setEditValues(v => ({ ...v, date: e.target.value }))}
                            onKeyDown={handleEditKeyDown}
                            placeholder="e.g. 1889"
                            className="text-[13px] text-neutral-600 bg-transparent border-b border-neutral-300 outline-none focus:border-neutral-600 w-28"
                          />
                        </div>
                      )}
                      {displayMedium && (
                        <div>
                          <p className="text-[9px] tracking-[0.4em] uppercase text-neutral-400 mb-1.5 font-bold">Medium</p>
                          <input
                            value={editValues.medium}
                            onChange={e => setEditValues(v => ({ ...v, medium: e.target.value }))}
                            onKeyDown={handleEditKeyDown}
                            placeholder="e.g. Oil on canvas"
                            className="text-[13px] text-neutral-600 bg-transparent border-b border-neutral-300 outline-none focus:border-neutral-600 w-44"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ) : (displayArtist || displayTitle || displayDate || displayMedium) ? (
                  <div className="flex items-center gap-2 min-w-0">
                    {/* Reanalyze button — desktop only; mobile uses "..." menu */}
                    {onReanalyze && item.artworkId && !item.isAnalyzing && (
                      <button
                        onClick={async () => {
                          if (isReanalyzing) return;
                          setIsReanalyzing(true);
                          try { await onReanalyze(); } catch { /* keep existing */ } finally { setIsReanalyzing(false); }
                        }}
                        disabled={isReanalyzing}
                        title="Re-identify with AI"
                        className="hidden sm:flex w-5 h-5 shrink-0 items-center justify-center rounded-full text-neutral-300 hover:text-neutral-500 transition-colors disabled:opacity-40"
                      >
                        <svg className={`w-3.5 h-3.5 ${isReanalyzing ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 2v6h-6" />
                          <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                          <path d="M3 22v-6h6" />
                          <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                        </svg>
                      </button>
                    )}
                    <div className="overflow-x-auto min-w-0 flex-1" style={{ scrollbarWidth: 'none' }}>
                      <div className="flex items-baseline gap-0 whitespace-nowrap">
                        {displayArtist && (
                          <span className="text-[16px] sm:text-[19px] font-medium text-neutral-900 tracking-tight">
                            {editValues.artist || displayArtist}
                          </span>
                        )}
                        {displayTitle && (
                          <>
                            {displayArtist && <span className="text-neutral-300 mx-2 text-[14px]">·</span>}
                            <span className="text-[14px] sm:text-[16px] font-serif italic text-neutral-500">
                              {editValues.title || displayTitle}
                            </span>
                          </>
                        )}
                        {displayDate && (
                          <>
                            <span className="text-neutral-300 mx-2 text-[13px]">·</span>
                            <span className="text-[12px] text-neutral-400">
                              {editValues.date ? formatDisplayDate(editValues.date) : formatDisplayDate(displayDate)}
                            </span>
                          </>
                        )}
                        {displayMedium && (
                          <>
                            <span className="text-neutral-300 mx-2 text-[13px]">·</span>
                            <span className="text-[12px] text-neutral-400">
                              {editValues.medium || displayMedium}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}

                {/* Tags — scrollable row between metadata and description */}
                {!item.isAnalyzing && (editTags.length > 0 || isEditing) && (
                  <div>
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
                      <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none', touchAction: 'pan-x' }}>
                        {editTags.map((tag, idx) => (
                          <HoverTag key={idx} tag={tag} artworkId={item.artworkId} />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {displayDescription && (
                  <div>
                    {/* Desktop-only retry button header; mobile uses "..." menu */}
                    {!item.isAnalyzing && onRetryHarder && (
                      <div className="hidden sm:flex justify-end mb-2">
                        <button
                          onClick={async () => {
                            if (isRetrying) return;
                            setIsRetrying(true);
                            try { await onRetryHarder(); } catch { /* keep current results */ } finally { setIsRetrying(false); }
                          }}
                          disabled={isRetrying}
                          title="Retry analysis with higher reasoning effort"
                          className="flex items-center gap-1.5 text-[9px] tracking-[0.2em] uppercase text-neutral-400 hover:text-neutral-700 border border-neutral-200 hover:border-neutral-400 px-2.5 py-1 rounded-full transition-colors disabled:opacity-50"
                        >
                          {isRetrying && <span className="inline-block w-2.5 h-2.5 border-t border-neutral-400 rounded-full animate-spin shrink-0" />}
                          {isRetrying ? 'Retrying…' : 'Retry with higher reasoning'}
                        </button>
                      </div>
                    )}
                    <div className="text-[13px] sm:text-[14px] leading-relaxed text-neutral-600 font-serif">
                      <ReactMarkdown components={markdownComponents}>{displayDescription}</ReactMarkdown>
                      {item.isAnalyzing && (
                        <span className="inline-block w-1.5 h-3 bg-neutral-400 animate-pulse ml-0.5"></span>
                      )}
                    </div>
                  </div>
                )}

                {/* Unlock points — collapsed by default, expand on click */}
                {(isLoadingUnlock || unlockPoints.length > 0) && (
                  <div className="border-t border-neutral-50 pt-5">
                    <p className="text-[9px] tracking-[0.4em] uppercase text-neutral-400 font-bold mb-3">Unlock Points</p>
                    {isLoadingUnlock ? (
                      <div className="flex items-center gap-2 text-neutral-300">
                        <div className="w-3 h-3 border-t border-neutral-300 rounded-full animate-spin shrink-0" />
                        <span className="text-[11px] tracking-wide">Looking up context…</span>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {unlockPoints.map((pt, idx) => {
                          const colors = [
                            { dot: '#7F77DD', bg: '#EEEDFE', border: '#C5C1F0', text: '#3C3489' },
                            { dot: '#1D9E75', bg: '#E1F5EE', border: '#5DCAA5', text: '#085041' },
                            { dot: '#D85A30', bg: '#FAECE7', border: '#F0997B', text: '#712B13' },
                          ];
                          const c = colors[idx % colors.length];
                          return (
                            <UnlockPoint key={idx} pt={pt} idx={idx} c={c} />
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Reference sources from Vision web detection — thumbnail cards */}
                {!item.isAnalyzing && item.referenceUrls && item.referenceUrls.length > 0 && (
                  <div className="pt-1 pb-2">
                    <p className="text-[9px] tracking-[0.4em] uppercase text-neutral-400 font-bold mb-2">Sources</p>
                    <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none', touchAction: 'pan-x' }}>
                      {item.referenceUrls.map((ref, idx) => {
                        const pageUrl = typeof ref === 'string' ? ref : ref.page_url;
                        const thumbnail = typeof ref === 'string' ? undefined : ref.thumbnail;
                        const title = typeof ref === 'string' ? undefined : ref.title;
                        let hostname = pageUrl;
                        try { hostname = new URL(pageUrl).hostname.replace(/^www\./, ''); } catch {}
                        return (
                          <a
                            key={idx}
                            href={pageUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 w-28 overflow-hidden rounded-xl border border-neutral-100 hover:border-neutral-300 transition-colors shadow-sm hover:shadow-md"
                            title={title || hostname}
                          >
                            <div className="w-full h-[4.5rem] relative bg-neutral-50 overflow-hidden">
                              <div className="absolute inset-0 flex items-center justify-center text-neutral-200">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                  <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                                </svg>
                              </div>
                              {thumbnail && (
                                <img
                                  src={thumbnail}
                                  className="absolute inset-0 w-full h-full object-cover"
                                  alt={hostname}
                                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                />
                              )}
                            </div>
                            <div className="px-2 py-1.5">
                              <span className="text-[9px] text-neutral-500 truncate block leading-tight">{hostname}</span>
                            </div>
                          </a>
                        );
                      })}
                    </div>
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
              <div ref={scrollRef} className="sm:flex-1 sm:overflow-y-auto sm:min-h-0 p-4 sm:p-6 space-y-4 sm:space-y-6 scroll-smooth pb-20 sm:pb-6">
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
                    {m.role === 'user' ? (
                      <div className="max-w-[85%] p-3 sm:p-4 text-[14px] leading-relaxed tracking-wide bg-neutral-900 text-white rounded-2xl rounded-tr-none">
                        {m.text}
                      </div>
                    ) : (
                      <div className="w-full text-[14px] leading-relaxed text-neutral-800 font-serif">
                        {m.text ? (
                          <div className="prose prose-sm max-w-none prose-neutral prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5">
                            <ReactMarkdown components={markdownComponents}>{m.text}</ReactMarkdown>
                          </div>
                        ) : (isWaitingForFirstChunk && idx === messages.length - 1 ? (
                          <div className="flex space-x-1.5 py-1">
                            <div className="w-1.5 h-1.5 bg-neutral-300 rounded-full animate-pulse"></div>
                            <div className="w-1.5 h-1.5 bg-neutral-300 rounded-full animate-pulse delay-75"></div>
                            <div className="w-1.5 h-1.5 bg-neutral-300 rounded-full animate-pulse delay-150"></div>
                          </div>
                        ) : null)}
                      </div>
                    )}
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


        {/* Navigation Arrows (visit sessions) — desktop only */}
        {allVisitItems && allVisitItems.length > 1 && onNavigate && (
          <div className="hidden sm:flex absolute right-4 top-1/2 -translate-y-1/2 flex-col items-center space-y-2 z-50 pointer-events-none">
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

    {/* Lightbox — tap image on mobile to view full */}
    {lightboxOpen && createPortal(
      <div
        className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center cursor-zoom-out"
        onClick={() => setLightboxOpen(false)}
      >
        <img
          src={item.url}
          className="max-w-full max-h-full object-contain"
          alt="Full view"
        />
        <button
          className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-colors"
          onClick={() => setLightboxOpen(false)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>,
      document.body
    )}

    </>
  );
};

export default InterpretationModal;
