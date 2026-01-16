
import React, { useState, useEffect, useRef } from 'react';
import { Message, GalleryItem } from '../types';
import { chatWithExhibition } from '../geminiService';

interface Props {
  items: GalleryItem[];
  conversation: Message[];
  onClose: () => void;
  onUpdateConversation: (newMessages: Message[]) => void;
}

const ExhibitionHall: React.FC<Props> = ({ items, conversation, onClose, onUpdateConversation }) => {
  const [messages, setMessages] = useState<Message[]>(conversation);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (text: string) => {
    if (!text.trim() || items.length === 0) return;
    const userMsg: Message = { role: 'user', text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      const modelText = await chatWithExhibition(items, messages, text);
      const modelMsg: Message = { role: 'model', text: modelText };
      setMessages(prev => [...prev, modelMsg]);
      onUpdateConversation([userMsg, modelMsg]);
    } catch (e) {
      console.error(e);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 sm:p-12">
      <div className="absolute inset-0 bg-neutral-900/60 backdrop-blur-2xl" onClick={onClose} />
      
      <div className="relative w-full max-w-5xl h-[80vh] bg-white rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-500">
        <div className="p-8 border-b border-neutral-50 flex justify-between items-center bg-neutral-50/50">
          <div>
            <h3 className="text-[12px] tracking-[0.6em] uppercase text-neutral-900 font-bold">The Exhibition Hall</h3>
            <p className="text-[10px] text-neutral-400 tracking-widest mt-1 uppercase">{items.length} works under review</p>
          </div>
          <button onClick={onClose} className="text-neutral-300 hover:text-neutral-900 transition-colors text-2xl">✕</button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Exhibition Map Thumbnails */}
          <div className="w-48 bg-neutral-50 p-6 overflow-y-auto hidden md:block border-r border-neutral-100">
            <h4 className="text-[8px] tracking-[0.4em] uppercase text-neutral-400 mb-6 font-bold">Curation</h4>
            <div className="space-y-4">
              {items.map(item => (
                <div key={item.id} className="relative group aspect-[3/4] rounded-lg overflow-hidden bg-white border border-neutral-100 p-1">
                  <img src={item.url} className="w-full h-full object-cover rounded shadow-sm" alt="Thumbnail" />
                </div>
              ))}
            </div>
          </div>

          {/* Hall Chat */}
          <div className="flex-1 flex flex-col bg-white">
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-10 space-y-8">
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
                  <div className={`max-w-[75%] p-6 text-[14px] leading-relaxed tracking-wide ${
                    m.role === 'user' 
                    ? 'bg-neutral-900 text-white rounded-[1.5rem] rounded-tr-none shadow-xl' 
                    : 'bg-neutral-50 text-neutral-800 rounded-[1.5rem] rounded-tl-none font-serif border border-neutral-100'
                  }`}>
                    {m.text}
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="flex justify-start">
                  <div className="bg-neutral-50 px-6 py-4 rounded-full flex space-x-2">
                    <div className="w-1.5 h-1.5 bg-neutral-300 rounded-full animate-bounce"></div>
                    <div className="w-1.5 h-1.5 bg-neutral-300 rounded-full animate-bounce delay-100"></div>
                    <div className="w-1.5 h-1.5 bg-neutral-300 rounded-full animate-bounce delay-200"></div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-8 bg-white border-t border-neutral-50">
              <div className="flex items-center space-x-4 max-w-3xl mx-auto">
                <input 
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend(input)}
                  placeholder="Speak to the Lead Curator..."
                  className="flex-1 text-[14px] bg-neutral-50 p-4 px-8 rounded-full outline-none focus:ring-1 focus:ring-neutral-200 transition-all border border-neutral-100"
                />
                <button 
                  onClick={() => handleSend(input)}
                  className="w-14 h-14 rounded-full bg-neutral-900 text-white flex items-center justify-center hover:scale-110 active:scale-95 transition-transform shadow-lg"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
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
