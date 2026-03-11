
import React, { useState, useRef, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { GalleryItem, CuratorConversation, Message } from '../types';
import { exhibitionChatStream } from '../apiService';

interface Props {
  items: GalleryItem[];
  sidebarOpen: boolean;
  onCloseSidebar: () => void;
  conversations: CuratorConversation[];
  onSaveConversation: (convId: string, newMsgs: Message[], itemIds: string[]) => void;
  onDeleteConversation: (id: string) => void;
}

const PROMPTS: { label: string; sublabel: string; symbol: string }[] = [
  { label: 'What themes connect', sublabel: 'my collection?', symbol: '◇' },
  { label: 'Which artists appear', sublabel: 'most in my gallery?', symbol: '◎' },
  { label: 'Summarize my', sublabel: 'recent museum visits', symbol: '◈' },
  { label: 'What movements', sublabel: 'am I drawn to?', symbol: '△' },
];

const markdownComponents = {
  p: ({ children }: { children?: React.ReactNode }) => <span className="block [&+&]:mt-2">{children}</span>,
  strong: ({ children }: { children?: React.ReactNode }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }: { children?: React.ReactNode }) => <em className="italic">{children}</em>,
  ul: ({ children }: { children?: React.ReactNode }) => <ul className="list-disc list-inside my-2 space-y-0.5">{children}</ul>,
  ol: ({ children }: { children?: React.ReactNode }) => <ol className="list-decimal list-inside my-2 space-y-0.5">{children}</ol>,
  li: ({ children }: { children?: React.ReactNode }) => <li className="leading-relaxed">{children}</li>,
  code: ({ children }: { children?: React.ReactNode }) => <code className="bg-neutral-100 px-1 py-0.5 rounded text-[12px] font-mono">{children}</code>,
  h1: ({ children }: { children?: React.ReactNode }) => <span className="block font-semibold text-[15px] mt-3 mb-1">{children}</span>,
  h2: ({ children }: { children?: React.ReactNode }) => <span className="block font-semibold text-[14px] mt-2 mb-1">{children}</span>,
  h3: ({ children }: { children?: React.ReactNode }) => <span className="block font-medium text-[13px] mt-2">{children}</span>,
};

function formatRelativeDate(ts: number): string {
  const diff = Date.now() - ts;
  const DAY = 86_400_000;
  if (diff < DAY) return 'Today';
  if (diff < 2 * DAY) return 'Yesterday';
  if (diff < 7 * DAY) return 'Last 7 days';
  if (diff < 30 * DAY) return 'Last 30 days';
  return new Date(ts).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

const UnderstandView: React.FC<Props> = ({
  items,
  sidebarOpen,
  onCloseSidebar,
  conversations,
  onSaveConversation,
  onDeleteConversation,
}) => {
  // Prompt page input
  const [promptInput, setPromptInput] = useState('');
  // Chat page input
  const [chatInput, setChatInput] = useState('');

  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Active conversation
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [localMessages, streamingText]);

  const isInChat = activeConvId !== null;

  /* ── API call helper ───────────────────────────────────── */
  const sendToAPI = (
    convId: string,
    history: Message[],
    text: string,
    onFirstMsg?: (userMsg: Message) => void,
  ) => {
    const userMsg: Message = { role: 'user', text };
    setIsTyping(true);
    setStreamingText('');
    onFirstMsg?.(userMsg);

    exhibitionChatStream(
      items,
      history,
      text,
      (chunk) => setStreamingText(prev => prev + chunk),
      (fullResponse) => {
        const modelMsg: Message = { role: 'model', text: fullResponse };
        setLocalMessages(prev => [...prev, modelMsg]);
        setStreamingText('');
        setIsTyping(false);
        onSaveConversation(convId, [userMsg, modelMsg], items.map(i => i.id));
      },
      (e) => {
        console.error(e);
        const errorMsg: Message = { role: 'model', text: 'Something went wrong while reaching the curator. Please try again.' };
        setLocalMessages(prev => [...prev, errorMsg]);
        setStreamingText('');
        setIsTyping(false);
      }
    );
  };

  /* ── Start a fresh conversation ────────────────────────── */
  const startNewConversation = (initialMsg: string) => {
    if (!initialMsg.trim() || items.length === 0) return;
    const newId = crypto.randomUUID();
    setActiveConvId(newId);
    setChatInput('');
    setLocalMessages([]); // will be populated by sendToAPI callback

    // send with empty history
    sendToAPI(newId, [], initialMsg, (userMsg) => {
      setLocalMessages([userMsg]);
    });
  };

  /* ── Open an existing conversation ─────────────────────── */
  const openConversation = (conv: CuratorConversation) => {
    if (isTyping) return; // don't switch while streaming
    setActiveConvId(conv.id);
    setLocalMessages([...conv.messages]);
    setStreamingText('');
    setIsTyping(false);
    setChatInput('');
  };

  /* ── Continue sending in active conversation ────────────── */
  const handleChatSend = () => {
    const text = chatInput.trim();
    if (!text || !activeConvId || isTyping || items.length === 0) return;
    const convId = activeConvId;
    const historySnapshot = [...localMessages]; // snapshot before state update

    setChatInput('');
    setLocalMessages(prev => [...prev, { role: 'user', text }]);
    sendToAPI(convId, historySnapshot, text);
  };

  /* ── Return to prompts page ─────────────────────────────── */
  const handleNewChat = () => {
    if (isTyping) return;
    setActiveConvId(null);
    setLocalMessages([]);
    setStreamingText('');
    setChatInput('');
    setPromptInput('');
  };

  /* ── Group sidebar conversations ────────────────────────── */
  const groupedConversations = useMemo(() => {
    const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);
    const buckets = new Map<string, CuratorConversation[]>();
    sorted.forEach(conv => {
      const label = formatRelativeDate(conv.updatedAt);
      if (!buckets.has(label)) buckets.set(label, []);
      buckets.get(label)!.push(conv);
    });
    return Array.from(buckets.entries());
  }, [conversations]);

  return (
    <div className="w-full h-full flex overflow-hidden bg-white relative">

      {/* ── Backdrop — mobile only, closes sidebar on outside click */}
      {sidebarOpen && (
        <div
          className="absolute inset-0 z-10 bg-black/20 sm:hidden"
          onClick={onCloseSidebar}
        />
      )}

      {/* ── Sidebar
            Mobile  (<sm): absolute overlay, shadow, z-20
            Desktop (≥sm): static flex participant, no shadow        */}
      <aside
        className={`flex-shrink-0 flex flex-col border-r border-neutral-100 bg-[#fafafa] transition-all duration-300 overflow-hidden absolute inset-y-0 left-0 z-20 shadow-xl sm:static sm:shadow-none sm:z-auto ${
          sidebarOpen ? 'w-64 sm:w-60' : 'w-0'
        }`}
      >
        {/* Sidebar header */}
        <div className="shrink-0 px-4 pt-5 pb-3 flex items-center justify-between">
          <p className="text-[9px] tracking-[0.3em] uppercase text-neutral-400">History</p>
          {isInChat && (
            <button
              onClick={handleNewChat}
              title="New conversation"
              className="w-6 h-6 rounded-md flex items-center justify-center text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200 transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14"/>
              </svg>
            </button>
          )}
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto px-2 pb-6 space-y-5">
          {groupedConversations.length === 0 ? (
            <p className="text-[10px] text-neutral-300 px-2 pt-1 tracking-wide leading-relaxed">
              Conversations will appear here after chatting with the curator.
            </p>
          ) : (
            groupedConversations.map(([label, convs]) => (
              <div key={label}>
                <p className="text-[8px] tracking-[0.25em] uppercase text-neutral-300 px-2 mb-1.5">{label}</p>
                {convs.map(conv => (
                  <div
                    key={conv.id}
                    className={`group relative flex items-center rounded-lg px-2 py-2 cursor-pointer transition-all ${
                      activeConvId === conv.id
                        ? 'bg-neutral-100'
                        : 'hover:bg-white hover:shadow-sm'
                    }`}
                    onMouseEnter={() => setHoveredId(conv.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={() => openConversation(conv)}
                  >
                    <p className="flex-1 text-[11px] text-neutral-600 leading-snug truncate pr-5">
                      {conv.title}
                    </p>
                    {hoveredId === conv.id && (
                      <button
                        onClick={e => { e.stopPropagation(); onDeleteConversation(conv.id); }}
                        className="absolute right-1.5 w-5 h-5 rounded flex items-center justify-center text-neutral-300 hover:text-red-400 hover:bg-red-50 transition-colors"
                        aria-label="Delete conversation"
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </aside>

      {/* ── Main panel ──────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-0 relative">

        {isInChat ? (
          /* ── Chat view ───────────────────────────────────── */
          <>
            {/* Message thread */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto min-h-0 px-4 sm:px-8 pt-6 pb-4"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              <div className="max-w-2xl mx-auto space-y-5">
                {localMessages.length === 0 && !isTyping && (
                  <div className="flex flex-col items-center justify-center py-24 text-center">
                    <div className="w-px h-10 bg-neutral-200 mb-5" />
                    <p className="text-[15px] text-neutral-400 font-serif italic">
                      Ask anything about your collection…
                    </p>
                  </div>
                )}

                {localMessages.map((m, idx) => (
                  <div key={idx} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {m.role === 'user' ? (
                      <div className="max-w-[85%] sm:max-w-[78%] px-4 py-3 text-[15px] leading-relaxed bg-neutral-900 text-white rounded-2xl rounded-tr-sm shadow-sm">
                        {m.text}
                      </div>
                    ) : (
                      <div className="w-full text-[15px] leading-relaxed text-neutral-800 font-serif prose prose-sm max-w-none prose-p:my-1">
                        <ReactMarkdown components={markdownComponents}>{m.text}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                ))}

                {/* Streaming / typing indicator */}
                {isTyping && (
                  <div className="w-full text-[15px] leading-relaxed text-neutral-800 font-serif prose prose-sm max-w-none prose-p:my-1">
                    {streamingText ? (
                      <ReactMarkdown components={markdownComponents}>{streamingText}</ReactMarkdown>
                    ) : (
                      <span className="inline-flex items-center space-x-1 py-1">
                        <span className="w-1.5 h-1.5 bg-neutral-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 bg-neutral-300 rounded-full animate-bounce" style={{ animationDelay: '120ms' }} />
                        <span className="w-1.5 h-1.5 bg-neutral-300 rounded-full animate-bounce" style={{ animationDelay: '240ms' }} />
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Chat input bar */}
            <div className="shrink-0 px-4 sm:px-8 py-4 border-t border-neutral-100 bg-white">
              <div className="max-w-2xl mx-auto flex items-center space-x-3 bg-neutral-50 border border-neutral-200 rounded-2xl px-4 py-3 focus-within:border-neutral-400 focus-within:shadow-sm transition-all">
                <input
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) handleChatSend(); }}
                  placeholder="Continue the conversation…"
                  disabled={isTyping}
                  className="flex-1 bg-transparent outline-none text-[13px] sm:text-[14px] text-neutral-700 placeholder-neutral-400 disabled:opacity-50"
                />
                <button
                  onClick={handleChatSend}
                  disabled={!chatInput.trim() || isTyping}
                  className="w-7 h-7 rounded-full bg-neutral-900 text-white flex items-center justify-center hover:scale-110 active:scale-95 transition-transform disabled:opacity-30 disabled:scale-100 shrink-0"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                </button>
              </div>
            </div>
          </>
        ) : (
          /* ── Starter prompts view ────────────────────────── */
          <div className="flex-1 flex flex-col items-center justify-center px-6 pb-16 overflow-y-auto">
            <p className="text-[8px] tracking-[0.4em] uppercase text-neutral-400 mb-3">The Curator</p>
            <h2 className="font-serif text-2xl sm:text-3xl text-neutral-700 mb-1.5 text-center">
              Understand Your Collection
            </h2>
            <p className="text-[11px] text-neutral-400 mb-10 tracking-wide">
              {items.length > 0
                ? `${items.length} piece${items.length !== 1 ? 's' : ''} in your gallery`
                : 'Add artworks in Explore to begin'}
            </p>

            {items.length > 0 ? (
              <>
                <div className="grid grid-cols-2 gap-3 w-full max-w-sm mb-6">
                  {PROMPTS.map(({ label, sublabel, symbol }) => (
                    <button
                      key={label}
                      onClick={() => startNewConversation(`${label} ${sublabel}`)}
                      className="p-4 bg-white border border-neutral-200 rounded-2xl text-left hover:border-neutral-400 hover:shadow-lg transition-all group"
                    >
                      <span className="block text-xl mb-2.5 text-neutral-300 group-hover:text-neutral-500 transition-colors font-light">
                        {symbol}
                      </span>
                      <span className="block text-[11px] text-neutral-600 leading-snug font-medium">{label}</span>
                      <span className="block text-[11px] text-neutral-400 leading-snug">{sublabel}</span>
                    </button>
                  ))}
                </div>

                <div className="flex items-center w-full max-w-sm bg-white border border-neutral-200 rounded-full px-4 py-3 shadow-sm focus-within:border-neutral-400 focus-within:shadow-md transition-all">
                  <input
                    value={promptInput}
                    onChange={e => setPromptInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { startNewConversation(promptInput); setPromptInput(''); } }}
                    placeholder="Ask anything about your gallery…"
                    className="flex-1 bg-transparent outline-none text-sm text-neutral-700 placeholder-neutral-400"
                  />
                  {promptInput.trim() && (
                    <button
                      onClick={() => { startNewConversation(promptInput); setPromptInput(''); }}
                      className="w-7 h-7 rounded-full bg-neutral-900 text-white flex items-center justify-center ml-2 hover:scale-110 transition-transform shrink-0"
                    >
                      <span className="text-[10px]">↑</span>
                    </button>
                  )}
                </div>
              </>
            ) : (
              <p className="text-[10px] tracking-[0.3em] uppercase text-neutral-300">
                No pieces yet — explore first
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default UnderstandView;
