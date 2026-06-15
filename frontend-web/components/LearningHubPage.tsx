import React, { useState, useEffect } from 'react';
import ArtSkillsView from './ArtSkillsView';
import CanvasHeader from './CanvasHeader';

interface Guide {
  slug: string;
  title: string;
  description: string;
  badge?: string;
}

const GUIDES: Guide[] = [
  {
    slug: 'art-skills',
    title: 'Art Skills',
    description: 'Build a vocabulary for reading technique, composition, and style across art movements.',
    badge: 'Foundation',
  },
];

function renderGuide(slug: string): React.ReactNode {
  if (slug === 'art-skills') return <ArtSkillsView />;
  return (
    <div className="flex items-center justify-center h-48">
      <p className="text-neutral-300 text-sm">Guide not found.</p>
    </div>
  );
}

interface Props {
  onClose?: () => void;
  initialGuide?: string | null;
  inline?: boolean;
  leftSlot?: React.ReactNode;
}

export default function LearningHubPage({ onClose, initialGuide, inline, leftSlot }: Props) {
  const [selectedGuide, setSelectedGuide] = useState<string | null>(initialGuide ?? null);

  useEffect(() => {
    const path = selectedGuide ? `/learning/${selectedGuide}` : '/learning';
    window.history.pushState({}, '', path);
  }, [selectedGuide]);

  const guide = selectedGuide ? GUIDES.find(g => g.slug === selectedGuide) : null;

  return (
    <div
      className={inline ? "relative w-full h-full bg-[var(--color-bg-primary)] flex flex-col overflow-hidden animate-in fade-in duration-300" : "fixed inset-0 z-[var(--z-fullscreen-page)] bg-[var(--color-bg-primary)] flex flex-col overflow-hidden"}
      style={{ fontFamily: 'var(--font-family-sans)' }}
    >
      {selectedGuide ? (
        <CanvasHeader
          parentLabel="Learning Hub"
          parentClick={() => setSelectedGuide(null)}
          childLabel={guide?.title ?? selectedGuide}
          leftSlot={leftSlot}
          isInline={inline}
        />
      ) : (
        leftSlot ? (
          <div className="pointer-events-none absolute left-4 top-3 z-20 md:hidden">
            <div className="pointer-events-auto">
              {leftSlot}
            </div>
          </div>
        ) : null
      )}

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {selectedGuide ? (
          <div className="h-full">
            {renderGuide(selectedGuide)}
          </div>
        ) : (
          /* Index — list of guides */
          <div className="h-full overflow-y-auto">
            <div className="max-w-2xl mx-auto px-5 sm:px-8 py-8">
              <p className="mb-6 text-[11px] font-medium text-neutral-400">
                Guides
              </p>
              <div className="flex flex-col gap-3">
                {GUIDES.map(g => (
                  <button
                    key={g.slug}
                    onClick={() => setSelectedGuide(g.slug)}
                    className="w-full text-left flex items-center gap-4 p-4 rounded-2xl border border-neutral-200/60 hover:border-neutral-300 hover:bg-[#f1ece1] transition-all group"
                  >
                    <div className="w-12 h-12 rounded-xl bg-[#efe8dc] flex items-center justify-center shrink-0 group-hover:bg-[#efe8dc]/80 transition-colors">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-600">
                        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                      </svg>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-[14px] font-semibold text-neutral-900 leading-tight">{g.title}</p>
                        {g.badge && (
                          <span className="rounded-full border border-neutral-200/40 bg-[#f1ece1] px-2 py-0.5 text-[10px] font-medium text-neutral-600">
                            {g.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-[12px] text-neutral-500 leading-snug">{g.description}</p>
                    </div>

                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-400 group-hover:text-neutral-600 shrink-0 transition-colors">
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
