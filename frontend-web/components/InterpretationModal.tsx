
import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { Message, Annotation } from '../types';
import { chatWithArtwork, base64ToFile, getTagExplanation } from '../apiService';

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
  };
  onClose: () => void;
  onUpdateConversation: (id: string, newMessages: Message[]) => void;
  onUpdateAnnotations: (annotations: Annotation[]) => void;
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
        setExplanation(result.explanation);
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

const InterpretationModal: React.FC<Props> = ({ item, onClose, onUpdateConversation, onUpdateAnnotations }) => {
  const [messages, setMessages] = useState<Message[]>(item.conversation);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [newAnnotationPos, setNewAnnotationPos] = useState<{ x: number, y: number } | null>(null);
  const [annotationInput, setAnnotationInput] = useState('');
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageAspect, setImageAspect] = useState<number>(1); // width/height ratio
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
  }, [messages]);

  const handleSend = async (text: string) => {
    if (!text.trim()) return;
    const userMsg: Message = { role: 'user', text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      // Convert base64 URL to File for the API (only needed if no artworkId)
      let imageFile: File | undefined;
      if (!item.artworkId && item.url.startsWith('data:')) {
        imageFile = base64ToFile(item.url, 'artwork.jpg');
      }

      // Use artworkId mode if available (DB-backed, reliable)
      // Otherwise fall back to stateless mode with conversation history
      const modelText = await chatWithArtwork(
        text,
        item.artworkId,  // If provided, uses DB for conversation history
        item.artistName,
        item.artworkName,
        messages,        // Only used if artworkId not provided
        imageFile
      );
      const modelMsg: Message = { role: 'model', text: modelText };
      setMessages(prev => [...prev, modelMsg]);
      onUpdateConversation(item.id, [userMsg, modelMsg]);
    } catch (e) {
      console.error(e);
    } finally {
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

  // Calculate modal dimensions based on image aspect ratio
  // For portrait images: taller modal, for landscape: wider modal
  const getModalStyle = () => {
    const maxHeight = 85; // vh
    const maxWidth = 90; // vw
    const chatPanelWidth = 380; // px - fixed width for chat panel

    if (!imageLoaded) {
      return { width: '600px', height: '400px' }; // Loading placeholder
    }

    // Calculate image display size that fits within constraints
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const maxImageHeight = (maxHeight / 100) * viewportHeight - 64; // minus padding
    const maxImageWidth = (maxWidth / 100) * viewportWidth - chatPanelWidth - 64;

    let imageHeight = maxImageHeight;
    let imageWidth = imageHeight * imageAspect;

    // If image width exceeds max, scale down
    if (imageWidth > maxImageWidth) {
      imageWidth = maxImageWidth;
      imageHeight = imageWidth / imageAspect;
    }

    const totalWidth = imageWidth + chatPanelWidth + 64; // image + chat + padding
    const totalHeight = imageHeight + 64; // image + padding

    return {
      width: `${Math.min(totalWidth, (maxWidth / 100) * viewportWidth)}px`,
      height: `${Math.min(totalHeight, (maxHeight / 100) * viewportHeight)}px`,
    };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 sm:p-12">
      <div className="absolute inset-0 bg-neutral-900/40 backdrop-blur-xl" onClick={onClose} />

      {/* Loading spinner */}
      {!imageLoaded && (
        <div className="absolute z-10 flex flex-col items-center space-y-4">
          <div className="w-12 h-12 border-t-2 border-neutral-800 rounded-full animate-spin"></div>
          <p className="text-[10px] tracking-widest text-neutral-400 uppercase">Loading...</p>
        </div>
      )}

      <div
        className={`relative bg-white rounded-[2rem] shadow-2xl overflow-hidden flex flex-col sm:flex-row animate-in zoom-in-95 duration-500 transition-all ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
        style={getModalStyle()}
      >
        {/* Visual Reference & Annotation Canvas */}
        <div className="flex-1 bg-neutral-50 flex items-center justify-center p-8 overflow-hidden relative group/canvas">
          <div className="relative inline-block cursor-crosshair">
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
          </div>
          <div className="absolute bottom-8 left-8 text-[9px] tracking-[0.4em] uppercase text-neutral-300 pointer-events-none">
            Click to Annotate Area of Interest
          </div>
        </div>

        {/* Chat Interface */}
        <div className="w-full sm:w-[380px] flex flex-col h-full bg-white border-l border-neutral-100 shrink-0">
          <div className="p-6 border-b border-neutral-50 flex justify-between items-center">
            <h3 className="text-[10px] tracking-[0.5em] uppercase text-neutral-400 font-bold">Spatial Dialogue</h3>
            <button onClick={onClose} className="text-neutral-300 hover:text-neutral-900 transition-colors text-xl">✕</button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth">
            {/* Loading State while analyzing */}
            {item.isAnalyzing && (
              <div className="flex flex-col items-center justify-center py-16 space-y-6">
                <div className="relative">
                  <div className="w-16 h-16 border-2 border-neutral-100 rounded-full"></div>
                  <div className="absolute inset-0 w-16 h-16 border-t-2 border-neutral-800 rounded-full animate-spin"></div>
                </div>
                <div className="text-center space-y-2">
                  <p className="text-[10px] tracking-[0.4em] uppercase text-neutral-400 font-bold">Analyzing Artwork</p>
                  <p className="text-[11px] text-neutral-400 italic font-serif">
                    The curator is examining your piece...
                  </p>
                </div>
              </div>
            )}

            {/* Artwork Info Section */}
            {!item.isAnalyzing && (item.artistName || item.artworkName || item.description || item.keywords) && (
              <div className="pb-6 border-b border-neutral-100 space-y-4">
                {item.artistName && (
                  <div>
                    <p className="text-[9px] tracking-[0.3em] uppercase text-neutral-400 mb-1">Artist</p>
                    <p className="text-[15px] font-medium text-neutral-800">{item.artistName}</p>
                  </div>
                )}
                {item.artworkName && (
                  <div>
                    <p className="text-[9px] tracking-[0.3em] uppercase text-neutral-400 mb-1">Title</p>
                    <p className="text-[14px] font-serif italic text-neutral-700">{item.artworkName}</p>
                  </div>
                )}
                {item.description && (
                  <div>
                    <p className="text-[9px] tracking-[0.3em] uppercase text-neutral-400 mb-1">Description</p>
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
            )}

            {!item.isAnalyzing && messages.length === 0 && !item.artistName && !item.artworkName && (
              <div className="text-center py-12">
                <p className="text-[11px] text-neutral-400 italic mb-4 font-serif leading-relaxed px-8">
                  The curator awaits your spatial and conceptual queries.
                </p>
              </div>
            )}
            {messages.map((m, idx) => (
              <div key={idx} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] p-4 text-[13px] leading-relaxed tracking-wide ${
                  m.role === 'user' 
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
          </div>

          <div className="p-6 border-t border-neutral-50">
            <div className="flex items-center space-x-4">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !item.isAnalyzing && handleSend(input)}
                placeholder={item.isAnalyzing ? "Analyzing artwork..." : "Consult the architectural void..."}
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
