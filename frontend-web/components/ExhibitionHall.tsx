import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { Message, GalleryItem } from '../types';
import { exhibitionChatStream } from '../apiService';

const markdownComponents = {
  p: ({ children }: { children?: React.ReactNode }) => <span className="block [&+&]:mt-2">{children}</span>,
  strong: ({ children }: { children?: React.ReactNode }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }: { children?: React.ReactNode }) => <em className="italic">{children}</em>,
  ul: ({ children }: { children?: React.ReactNode }) => <ul className="list-disc list-inside my-2 space-y-0.5">{children}</ul>,
  ol: ({ children }: { children?: React.ReactNode }) => <ol className="list-decimal list-inside my-2 space-y-0.5">{children}</ol>,
  li: ({ children }: { children?: React.ReactNode }) => <li className="leading-relaxed">{children}</li>,
  code: ({ children }: { children?: React.ReactNode }) => <code className="bg-neutral-200/80 px-1 py-0.5 rounded text-[12px] font-mono">{children}</code>,
  h1: ({ children }: { children?: React.ReactNode }) => <span className="block font-semibold text-[15px] mt-3 mb-1">{children}</span>,
  h2: ({ children }: { children?: React.ReactNode }) => <span className="block font-semibold text-[14px] mt-2 mb-1">{children}</span>,
  h3: ({ children }: { children?: React.ReactNode }) => <span className="block font-medium text-[13px] mt-2">{children}</span>,
};

interface Props {
  items: GalleryItem[];
  conversation: Message[];
  onClose: () => void;
  onUpdateConversation: (newMessages: Message[]) => void;
  onDeleteItem?: (id: string) => void;
  onInterpret?: (item: GalleryItem) => void;
  initialMessage?: string;
}

const ExhibitionHall: React.FC<Props> = ({ items, conversation, onClose, onUpdateConversation, onDeleteItem, onInterpret, initialMessage }) => {
  const [messages, setMessages] = useState<Message[]>(conversation);
  const [streamingText, setStreamingText] = useState('');
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const initialSent = useRef(false);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingText]);

  // Auto-send initial message on mount
  useEffect(() => {
    if (initialMessage && !initialSent.current) {
      initialSent.current = true;
      handleSend(initialMessage);
    }
  }, []);

  const handleSend = async (text: string) => {
    if (!text.trim() || items.length === 0) return;
    const userMsg: Message = { role: 'user', text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setStreamingText('');
    setIsTyping(true);

    exhibitionChatStream(
      items,
      messages,
      text,
      (chunk) => setStreamingText(prev => prev + chunk),
      (fullResponse) => {
        const modelMsg: Message = { role: 'model', text: fullResponse };
        setMessages(prev => [...prev, modelMsg]);
        setStreamingText('');
        setIsTyping(false);
        onUpdateConversation([userMsg, modelMsg]);
      },
      (e) => {
        console.error(e);
        setStreamingText('');
        setIsTyping(false);
      }
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-12">
      <div className="absolute inset-0 bg-neutral-900/60 backdrop-blur-2xl" onClick={onClose} />

      <div className="relative w-full max-w-5xl h-[100dvh] sm:h-[80vh] bg-white rounded-none sm:rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-500">
        <div className="p-4 sm:p-8 border-b border-neutral-50 flex justify-between items-center bg-neutral-50/50">
          <div>
            <h3 className="text-[11px] sm:text-[12px] tracking-[0.6em] uppercase text-neutral-900 font-bold">The Exhibition Hall</h3>
            <p className="text-[9px] sm:text-[10px] text-neutral-400 tracking-widest mt-1 uppercase">{items.length} works under review</p>
          </div>
          <button onClick={onClose} className="text-neutral-300 hover:text-neutral-900 transition-colors text-2xl">✕</button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Exhibition Map Thumbnails */}
          <div className="w-48 bg-neutral-50 p-6 overflow-y-auto hidden md:block border-r border-neutral-100">
            <h4 className="text-[8px] tracking-[0.4em] uppercase text-neutral-400 mb-6 font-bold">Curation</h4>
            <div className="space-y-4">
              {items.map(item => (
                <div
                  key={item.id}
                  className="relative group aspect-[3/4] rounded-lg overflow-hidden bg-white border border-neutral-100 p-1 cursor-pointer hover:border-neutral-900 transition-all hover:scale-105"
                  onClick={() => onInterpret?.(item)}
                >
                  <img src={item.url} className="w-full h-full object-cover rounded shadow-sm" alt="Thumbnail" />
                  {onDeleteItem && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteItem(item.id);
                      }}
                      className="absolute top-2 right-2 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 shadow-lg hover:scale-110"
                      title="Remove from exhibition"
                    >
                      <span className="text-[10px]">✕</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Hall Chat */}
          <div className="flex-1 flex flex-col bg-white">
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-10 space-y-4 sm:space-y-8">
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center max-w-sm mx-auto">
                  <div className="w-px h-12 bg-neutral-200 mb-6"></div>
                  <p className="text-[13px] text-neutral-400 font-serif italic leading-relaxed">
                    "The collective voice of an exhibition is often louder than its parts."
                  </p>
                  <p className="mt-4 text-[10px] tracking-widest uppercase text-neutral-300">Ask about themes, contrasts, or the narrative flow of your visit.</p>
                </div>
              )}
              {messages.map((m, idx) => (
                <div key={idx} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {m.role === 'user' ? (
                    <div className="max-w-[85%] sm:max-w-[75%] p-3 sm:p-5 text-[15px] sm:text-[15px] leading-relaxed tracking-wide bg-neutral-900 text-white rounded-2xl sm:rounded-[1.5rem] rounded-tr-none shadow-xl">
                      {m.text}
                    </div>
                  ) : (
                    <div className="w-full text-[15px] sm:text-[15px] leading-relaxed text-neutral-800 font-serif prose prose-sm max-w-none prose-p:my-1">
                      <ReactMarkdown components={markdownComponents}>{m.text}</ReactMarkdown>
                    </div>
                  )}
                </div>
              ))}
              {isTyping && (
                <div className="w-full text-[15px] leading-relaxed text-neutral-800 font-serif prose prose-sm max-w-none prose-p:my-1">
                  {streamingText ? (
                    <ReactMarkdown components={markdownComponents}>{streamingText}</ReactMarkdown>
                  ) : (
                    <span className="inline-flex space-x-1">
                      <span className="w-1.5 h-1.5 bg-neutral-300 rounded-full animate-bounce" />
                      <span className="w-1.5 h-1.5 bg-neutral-300 rounded-full animate-bounce delay-100" />
                      <span className="w-1.5 h-1.5 bg-neutral-300 rounded-full animate-bounce delay-200" />
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="p-3 sm:p-8 bg-white border-t border-neutral-50">
              <div className="flex items-center space-x-2 sm:space-x-4 max-w-3xl mx-auto">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend(input)}
                  placeholder="Speak to the Lead Curator..."
                  className="flex-1 text-[13px] sm:text-[14px] bg-neutral-50 p-3 px-5 sm:p-4 sm:px-8 rounded-full outline-none focus:ring-1 focus:ring-neutral-200 transition-all border border-neutral-100"
                />
                <button
                  onClick={() => handleSend(input)}
                  className="w-10 h-10 sm:w-14 sm:h-14 shrink-0 rounded-full bg-neutral-900 text-white flex items-center justify-center hover:scale-110 active:scale-95 transition-transform shadow-lg"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="sm:w-5 sm:h-5"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExhibitionHall;
