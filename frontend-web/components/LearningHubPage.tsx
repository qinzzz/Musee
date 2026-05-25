import React, { useState, useEffect } from 'react';
import ArtSkillsView from './ArtSkillsView';

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
  onClose: () => void;
  initialGuide?: string | null;
}

export default function LearningHubPage({ onClose, initialGuide }: Props) {
  const [selectedGuide, setSelectedGuide] = useState<string | null>(initialGuide ?? null);

  useEffect(() => {
    const path = selectedGuide ? `/learning/${selectedGuide}` : '/learning';
    window.history.pushState({}, '', path);
  }, [selectedGuide]);

  const guide = selectedGuide ? GUIDES.find(g => g.slug === selectedGuide) : null;

  return (
    <div
      className="fixed inset-0 z-[1100] bg-white flex flex-col overflow-hidden"
      style={{ fontFamily: 'system-ui, sans-serif' }}
    >
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-5 sm:px-8 pt-4 pb-3 border-b border-neutral-100">
        <button
          onClick={selectedGuide ? () => setSelectedGuide(null) : onClose}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-neutral-100 transition-colors shrink-0"
          aria-label="Back"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <div className="flex items-center gap-1.5 text-sm min-w-0">
          {selectedGuide ? (
            <>
              <button
                onClick={() => setSelectedGuide(null)}
                className="text-neutral-400 hover:text-neutral-700 transition-colors whitespace-nowrap"
              >
                Learning Hub
              </button>
              <span className="text-neutral-200">/</span>
              <span className="text-neutral-700 truncate">{guide?.title ?? selectedGuide}</span>
            </>
          ) : (
            <span className="text-neutral-700 font-semibold">Learning Hub</span>
          )}
        </div>
      </div>

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
              <p className="text-[11px] tracking-[0.2em] uppercase text-neutral-400 font-medium mb-6">
                Guides
              </p>
              <div className="flex flex-col gap-3">
                {GUIDES.map(g => (
                  <button
                    key={g.slug}
                    onClick={() => setSelectedGuide(g.slug)}
                    className="w-full text-left flex items-center gap-4 p-4 rounded-2xl border border-neutral-100 hover:border-neutral-300 hover:bg-neutral-50 transition-all group"
                  >
                    <div className="w-12 h-12 rounded-xl bg-neutral-100 flex items-center justify-center shrink-0 group-hover:bg-neutral-200 transition-colors">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-500">
                        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                      </svg>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-[14px] font-semibold text-neutral-900 leading-tight">{g.title}</p>
                        {g.badge && (
                          <span className="text-[9px] tracking-[0.15em] uppercase font-semibold px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-500">
                            {g.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-[12px] text-neutral-500 leading-snug">{g.description}</p>
                    </div>

                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-300 group-hover:text-neutral-500 shrink-0 transition-colors">
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
