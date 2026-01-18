
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
    artworkId?: string;  // Backend DB artwork ID for persistent conversations
    isAnalyzing?: boolean;  // Loading state while analyzing
    streamingText?: string;  // Real-time streaming text during analysis
  };
  onClose: () => void;
  onUpdateConversation: (id: string, newMessages: Message[]) => void;
  onUpdateAnnotations: (annotations: Annotation[]) => void;
  onDelete?: (id: string) => void;
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

const InterpretationModal: React.FC<Props> = ({ item, onClose, onUpdateConversation, onUpdateAnnotations, onDelete }) => {
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

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

      await chatWithArtworkStream(
        text,
        (chunk) => {
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
          // Final response received
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
        imageFile
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

    // Desktop: side-by-side layout, size based on image
    const maxHeight = 85; // vh
    const maxWidth = 90; // vw
    const chatPanelWidth = 500; // px - fixed width for chat panel (increased from 380)

    const maxImageHeight = (maxHeight / 100) * viewportHeight - 64;
    const maxImageWidth = (maxWidth / 100) * viewportWidth - chatPanelWidth - 64;

    let imageHeight = maxImageHeight;
    let imageWidth = imageHeight * imageAspect;

    if (imageWidth > maxImageWidth) {
      imageWidth = maxImageWidth;
      imageHeight = imageWidth / imageAspect;
    }

    const totalWidth = imageWidth + chatPanelWidth + 64;
    const totalHeight = imageHeight + 64;

    return {
      width: `${Math.min(totalWidth, (maxWidth / 100) * viewportWidth)}px`,
      height: `${Math.min(totalHeight, (maxHeight / 100) * viewportHeight)}px`,
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
        {/* Visual Reference & Annotation Canvas */}
        <div className="h-[40vh] sm:h-auto sm:flex-1 bg-neutral-50 flex items-center justify-center p-4 sm:p-8 overflow-hidden relative group/canvas shrink-0">
          <div className="relative inline-block cursor-crosshair max-h-full">
            <img
              ref={imageRef}
              src={item.url}
              onClick={handleImageClick}
              className="max-w-full max-h-[35vh] sm:max-h-full object-contain shadow-xl rounded-lg"
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

            {/* Overlay Toggle Button */}
            {!item.isAnalyzing && (item.artistName || item.artworkName || item.description || item.keywords) && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMetadata(!showMetadata);
                }}
                className={`absolute top-6 left-6 z-20 w-8 h-8 rounded-full border border-white/20 flex items-center justify-center transition-all duration-300 hover:scale-110 shadow-lg ${showMetadata
                    ? 'bg-neutral-900/10 text-neutral-800'
                    : 'bg-white/80 text-neutral-900'
                  }`}
                title={showMetadata ? "Hide Details" : "Show Details"}
              >
                {showMetadata ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                )}
              </button>
            )}

            {/* Metadata Overlay Card */}
            {showMetadata && !item.isAnalyzing && (item.artistName || item.artworkName || item.description || item.keywords) && (
              <div className="absolute inset-4 sm:inset-10 bg-white/90 backdrop-blur-md p-6 sm:p-10 rounded-2xl shadow-2xl border border-white/20 overflow-y-auto z-10 invisible sm:visible scrollbar-hide animate-in zoom-in-95 duration-500">
                <div className="space-y-8">
                  {item.artistName && (
                    <div>
                      <p className="text-[9px] tracking-[0.4em] uppercase text-neutral-400 mb-2 font-bold">Artist</p>
                      <p className="text-[18px] font-medium text-neutral-900 tracking-tight leading-tight">{item.artistName}</p>
                    </div>
                  )}
                  {item.artworkName && (
                    <div>
                      <p className="text-[9px] tracking-[0.4em] uppercase text-neutral-400 mb-2 font-bold">Title</p>
                      <p className="text-[16px] font-serif italic text-neutral-700 leading-tight">{item.artworkName}</p>
                    </div>
                  )}
                  {item.description && (
                    <div>
                      <p className="text-[9px] tracking-[0.4em] uppercase text-neutral-400 mb-2 font-bold">Description</p>
                      <div className="text-[12px] leading-relaxed text-neutral-600 font-serif">
                        <ReactMarkdown components={markdownComponents}>
                          {item.description}
                        </ReactMarkdown>
                      </div>
                    </div>
                  )}
                  {item.keywords && item.keywords.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-2">
                      {item.keywords.map((tag, idx) => (
                        <HoverTag
                          key={idx}
                          tag={tag}
                          artworkId={item.artworkId}
                        />
                      ))}
                    </div>
                  )}
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
          <div className="hidden sm:block absolute bottom-8 left-8 text-[9px] tracking-[0.4em] uppercase text-neutral-300 pointer-events-none">
            Click to Annotate Area of Interest
          </div>
        </div>

        {/* Chat Interface */}
        <div className="flex-1 sm:flex-none w-full sm:w-[500px] flex flex-col bg-white border-t sm:border-t-0 sm:border-l border-neutral-100 shrink-0 min-h-0">
          <div className="p-4 sm:p-6 border-b border-neutral-50 flex justify-between items-center shrink-0">
            <h3 className="text-[9px] sm:text-[10px] tracking-[0.4em] sm:tracking-[0.5em] uppercase text-neutral-400 font-bold">curator dialogue</h3>
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
                  {m.text}
                </div>
              </div>
            ))}
            {isTyping && (
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
      </div>
    </div>
  );
};

export default InterpretationModal;
