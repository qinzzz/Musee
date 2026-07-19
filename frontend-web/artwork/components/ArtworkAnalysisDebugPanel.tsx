import type React from 'react';
import { useEffect, useState } from 'react';

import { getArtworkAnalysisDebug } from '../../api/artworks';
import type { ArtworkAnalysisDebug } from '../../api/artworks';

// Internal/debug visualization of the artwork-analysis row (dimensions +
// tags). The backing endpoint 404s in prod, so this panel renders nothing
// there — no frontend env gating needed.

const DIMENSION_ORDER = [
  'recognizable_abstract',
  'calm_charged',
  'minimal_maximal',
  'controlled_freeform',
  'traditional_experimental',
  'playful_solemn',
];

const TAG_CATEGORY_ORDER = [
  'medium',
  'subject',
  'formal_visual',
  'mood_atmosphere',
  'theme_context',
  'artistic_strategy',
  'attraction_mode',
];

// Inferred tags get a dashed border so grounded vs. interpretive reads at a glance.
const INFERRED_SOURCES = new Set(['visual_inferred', 'context_inferred']);

const dimensionPoles = (key: string): [string, string] => {
  const [left, right] = key.split('_');
  return [left ?? key, right ?? ''];
};

interface Props {
  artworkId?: string;
  isAnalyzing?: boolean;
}

const ArtworkAnalysisDebugPanel: React.FC<Props> = ({ artworkId, isAnalyzing }) => {
  const [analysis, setAnalysis] = useState<ArtworkAnalysisDebug | null>(null);

  useEffect(() => {
    setAnalysis(null);
    if (!artworkId || isAnalyzing) return;
    let isCurrent = true;
    getArtworkAnalysisDebug(artworkId)
      .then((data) => {
        if (isCurrent) setAnalysis(data);
      })
      .catch(() => {});
    return () => {
      isCurrent = false;
    };
  }, [artworkId, isAnalyzing]);

  if (!analysis) return null;

  const dimensions = analysis.dimensions ?? {};
  const tags = analysis.tags ?? {};
  const tagCategories = TAG_CATEGORY_ORDER.filter((category) => (tags[category] ?? []).length > 0);

  return (
    <div className="border-t border-neutral-50 pt-5 pb-2">
      <p className="mb-3 text-[9px] font-bold uppercase tracking-[0.4em] text-neutral-400">
        Analysis · Internal
      </p>

      {analysis.status !== 'analyzed' && (
        <p className="mb-3 text-[11px] leading-5 text-neutral-500">
          <span className="font-medium text-neutral-700">{analysis.status}</span>
          {analysis.analyzability_note ? ` — ${analysis.analyzability_note}` : ''}
          {analysis.error ? ` — ${analysis.error}` : ''}
        </p>
      )}

      {analysis.visual_description && (
        <p className="mb-4 text-[11px] leading-5 text-neutral-500">{analysis.visual_description}</p>
      )}

      {DIMENSION_ORDER.some((key) => dimensions[key]) && (
        <div className="mb-4 space-y-2.5">
          {DIMENSION_ORDER.map((key) => {
            const entry = dimensions[key];
            if (!entry) return null;
            const [left, right] = dimensionPoles(key);
            const pct = ((entry.score - 1) / 4) * 100;
            return (
              <div key={key} title={(entry.evidence ?? []).join(' ')}>
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className={`text-[10px] capitalize ${entry.score <= 2 ? 'font-semibold text-neutral-700' : 'text-neutral-400'}`}>
                    {left}
                  </span>
                  <span className="font-mono text-[9px] text-neutral-300">{entry.score}/5</span>
                  <span className={`text-[10px] capitalize ${entry.score >= 4 ? 'font-semibold text-neutral-700' : 'text-neutral-400'}`}>
                    {right}
                  </span>
                </div>
                <div className="relative h-[2px] rounded-full bg-neutral-100">
                  <div className="absolute left-1/2 top-1/2 h-2 w-px -translate-x-1/2 -translate-y-1/2 bg-neutral-200" />
                  <div
                    className="absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-neutral-700"
                    style={{ left: `calc(${pct}% - 4px)` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tagCategories.map((category) => (
        <div key={category} className="mb-2.5">
          <p className="mb-1 text-[9px] uppercase tracking-[0.12em] text-neutral-300">
            {category.replace(/_/g, ' ')}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {(tags[category] ?? []).map((tag, index) => (
              <span
                key={`${tag.label}-${index}`}
                title={tag.source}
                className={`rounded-full border px-2 py-0.5 text-[10px] text-neutral-600 ${
                  INFERRED_SOURCES.has(tag.source) ? 'border-dashed border-neutral-300' : 'border-neutral-200'
                }`}
              >
                {tag.label}
              </span>
            ))}
          </div>
        </div>
      ))}

      <p className="mt-3 text-[9px] text-neutral-300">
        v{analysis.analysis_version}
        {analysis.model ? ` · ${analysis.model}` : ''}
        {analysis.completed_at ? ` · ${analysis.completed_at.slice(0, 10)}` : ''}
      </p>
    </div>
  );
};

export default ArtworkAnalysisDebugPanel;
