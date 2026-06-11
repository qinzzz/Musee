import React from 'react';
import { generateTasteProfile, getTasteProfile } from '../api/artworks';
import { TasteProfileSnapshot } from '../types';
import { Button } from './ui/button';

const DIMENSIONS = [
  { key: 'figurative_abstract', left: '具象', right: '抽象' },
  { key: 'emotive_conceptual', left: '感性', right: '理性' },
  { key: 'serene_intense', left: '宁静', right: '张力' },
  { key: 'classical_avantgarde', left: '经典', right: '先锋' },
  { key: 'playful_serious', left: '玩味', right: '严肃' },
] as const;

const POLE_EXPLANATIONS: Record<string, Record<'left' | 'right', string>> = {
  figurative_abstract: {
    left: '你的偏好仍然扎根于可辨认的形象、叙事与人物存在感。',
    right: '你更容易被抽象关系、形式结构与空间组织本身打动。',
  },
  emotive_conceptual: {
    left: '你更重视情绪穿透力与即时共鸣，而不是观念先行。',
    right: '你会被概念框架、思考结构与方法论更强的作品吸引。',
  },
  serene_intense: {
    left: '你偏爱较克制、稳定、能让观看慢下来的作品。',
    right: '你会被能量、冲突与更高视觉张力的作品牵引。',
  },
  classical_avantgarde: {
    left: '你对传统语汇、历史延续与经典秩序有稳定亲和力。',
    right: '你偏向实验、偏移与对既有规则的突破。',
  },
  playful_serious: {
    left: '你允许艺术带有轻盈、机智与游玩感。',
    right: '你更容易被沉重、严肃与高密度命题打动。',
  },
};

const parseNarrativeSummary = (raw: string | null | undefined): string[] => {
  if (!raw) return [];

  let text = raw.trim();

  const tryExtractFromJson = (candidate: string): string | null => {
    try {
      const parsed = JSON.parse(candidate);
      if (typeof parsed === 'string') return parsed;
      if (parsed && typeof parsed === 'object') {
        const record = parsed as Record<string, unknown>;
        const firstString = [
          record.personal_taste_profile,
          record.taste_profile,
          record.narrative_summary,
        ].find((value) => typeof value === 'string');
        if (typeof firstString === 'string') return firstString;
      }
    } catch {
      return null;
    }
    return null;
  };

  const extracted = tryExtractFromJson(text);
  if (extracted) {
    text = extracted;
  } else if (text.startsWith('{') && text.endsWith('}')) {
    const tasteProfileMatch = text.match(/"(?:personal_taste_profile|taste_profile|narrative_summary)"\s*:\s*"([\s\S]*)"\s*}/);
    if (tasteProfileMatch?.[1]) {
      text = tasteProfileMatch[1];
    }
  }

  text = text
    .replace(/^"+|"+$/g, '')
    .replace(/\\n/g, '\n')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
    .trim();

  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
};

interface Props {
  userId: string;
  refreshKey?: number;
  onStartUnsortedFlow: () => void;
}

const TasteProfileView: React.FC<Props> = ({
  userId,
  refreshKey = 0,
  onStartUnsortedFlow,
}) => {
  const [profile, setProfile] = React.useState<TasteProfileSnapshot | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [expandedDim, setExpandedDim] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const loadProfile = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getTasteProfile(userId);
      setProfile(data);
    } catch (err) {
      setProfile(null);
      setError(err instanceof Error ? err.message : 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  React.useEffect(() => {
    void loadProfile();
  }, [loadProfile, refreshKey]);

  const handleGenerate = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const data = await generateTasteProfile(userId);
      setProfile(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate taste profile');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-neutral-400">
        Loading taste profile…
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-[620px] px-8 py-12">
        <p className="text-[13px] text-neutral-500">{error || 'Taste profile unavailable.'}</p>
      </div>
    );
  }

  const eligibleCount = profile.eligible_count || 0;
  const requiredCount = profile.required_count || 5;
  const remaining = Math.max(0, requiredCount - eligibleCount);
  const tasteVector = profile.taste_vector || {};
  const dimensionExamples = profile.dimension_examples || {};
  const canRenderProfile = !!profile.is_generated;
  const callToActionLabel = profile.is_generated && profile.is_outdated ? 'Regenerate Taste Profile' : 'Generate Taste Profile';
  const progressPercent = Math.min(100, (eligibleCount / requiredCount) * 100);
  const onboardingCtaLabel = profile.can_generate ? 'Generate Taste Profile' : 'Sort Artworks';
  const onboardingHelperText = profile.can_generate
    ? 'You have enough judgments to generate your first taste profile.'
    : profile.unsorted_count > 0
      ? `${remaining} more Love or Not For Me classifications needed.`
      : `${remaining} more Love or Not For Me classifications needed. Capture and classify more works to continue.`;
  const narrativeParagraphs = parseNarrativeSummary(profile.narrative_summary);

  return (
    <div className="h-full overflow-y-auto bg-[var(--color-bg-primary)] px-7 py-10">
      <div className="mx-auto max-w-[620px]">
        {!canRenderProfile ? (
          <div className="rounded-[32px] border border-neutral-200 bg-white px-8 py-9 shadow-[0_12px_30px_rgba(0,0,0,0.04)]">
            <p className="text-[11px] font-medium text-neutral-400">Art personality</p>
            <h1 className="mt-4 text-[28px] font-semibold leading-tight text-neutral-900 sm:text-[32px]">
              Discover Your Taste
            </h1>
            <p className="mt-4 max-w-[560px] text-[14px] leading-7 text-neutral-500">
              Classify the works you return to and the ones that are not for you. Your taste profile emerges from that contrast.
            </p>

            <div className="mt-8 rounded-[28px] border border-neutral-200 bg-[var(--color-bg-tertiary)] px-6 py-6">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <p className="text-[11px] font-medium text-neutral-400">Progress</p>
                  <p className="mt-3 text-[32px] font-semibold leading-none text-neutral-900">
                    {eligibleCount} / {requiredCount}
                  </p>
                  <p className="mt-4 text-[14px] leading-7 text-neutral-500">
                    {onboardingHelperText}
                  </p>
                </div>
                <div className="hidden shrink-0 items-center gap-2 pt-6 sm:flex">
                  {Array.from({ length: requiredCount }).map((_, index) => (
                    <span
                      key={index}
                      className={`h-3 w-3 rounded-full ${index < eligibleCount ? 'bg-neutral-900' : 'bg-neutral-200'}`}
                    />
                  ))}
                </div>
              </div>

              <div className="mt-6 h-[2px] overflow-hidden rounded-full bg-neutral-100">
                <div
                  className="h-full rounded-full bg-neutral-900 transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Button
                  variant="primary"
                  disabled={submitting}
                  onClick={() => {
                    if (profile.can_generate) {
                      void handleGenerate();
                      return;
                    }
                    onStartUnsortedFlow();
                  }}
                >
                  {submitting ? 'Generating…' : onboardingCtaLabel}
                </Button>
              </div>

              <div className="mt-5 flex flex-wrap gap-4 text-[11px] text-neutral-400">
                <span>{profile.love_count} loved</span>
                <span>{profile.reject_count} not for me</span>
                <span>{profile.respect_count} respected</span>
                <span>{profile.unsorted_count} unsorted</span>
              </div>
            </div>

            {error && (
              <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[12px] leading-6 text-red-700">
                {error}
              </div>
            )}
          </div>
        ) : (
          <div className="mb-8">
            <p className="text-[11px] font-medium text-neutral-400">Art personality</p>
            <h1 className="mt-3 text-[34px] font-semibold leading-tight text-neutral-900">Taste Profile</h1>
            <p className="mt-3 max-w-[540px] text-[14px] leading-7 text-neutral-500">
              Classify works you love, respect, and reject. Your profile is generated manually from what you love and what is not for you.
            </p>

            {profile.is_outdated && (
              <div className="mt-6 rounded-[24px] border border-amber-200 bg-amber-50 px-5 py-4 shadow-[0_8px_24px_rgba(0,0,0,0.03)]">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <p className="text-[13px] leading-6 text-amber-900">
                    New insights available. Your profile may be outdated because classifications changed after the last generation.
                  </p>
                  <div className="flex items-center gap-3">
                    {profile.unsorted_count > 0 && (
                      <Button variant="secondary" onClick={onStartUnsortedFlow}>
                        Sort Unsorted Works
                      </Button>
                    )}
                    <Button variant="primary" disabled={submitting} onClick={() => void handleGenerate()}>
                      {submitting ? 'Generating…' : callToActionLabel}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[12px] leading-6 text-red-700">
                {error}
              </div>
            )}
          </div>
        )}

        {canRenderProfile && (
          <>
            <div className="mt-8 rounded-[28px] border border-neutral-200 bg-white px-6 py-6 shadow-[0_12px_30px_rgba(0,0,0,0.04)]">
              <p className="text-[11px] font-medium text-neutral-400">Narrative</p>
              {narrativeParagraphs.length > 0 ? (
                <div className="mt-5 space-y-4">
                  {narrativeParagraphs.map((paragraph, index) => (
                    <p key={index} className="text-[15px] leading-8 text-neutral-700">
                      {paragraph}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-[15px] leading-8 text-neutral-500">
                  Your taste profile has been generated, but the narrative summary is still empty.
                </p>
              )}
            </div>

            <div className="mt-8 rounded-[28px] border border-neutral-200 bg-white px-6 py-6 shadow-[0_12px_30px_rgba(0,0,0,0.04)]">
              <p className="text-[11px] font-medium text-neutral-400">Taste vector</p>
              <div className="mt-5 space-y-2">
                {DIMENSIONS.map(({ key, left, right }) => {
                  const score = tasteVector[key] ?? 0;
                  const pct = ((score + 1) / 2) * 100;
                  const exGroup = dimensionExamples[key];
                  const hasExamples = !!(exGroup && exGroup.examples.length > 0);
                  const expanded = expandedDim === key;
                  return (
                    <div key={key} className="border-b border-neutral-100 py-4 last:border-b-0">
                      <button
                        type="button"
                        disabled={!hasExamples}
                        onClick={() => setExpandedDim(expanded ? null : key)}
                        className="w-full text-left disabled:cursor-default"
                      >
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <span className={`text-[12px] ${score < -0.15 ? 'font-semibold text-neutral-900' : 'text-neutral-400'}`}>{left}</span>
                          <span className="text-[10px] text-neutral-300">{hasExamples ? (expanded ? 'Hide' : 'Open') : 'Neutral'}</span>
                          <span className={`text-[12px] ${score > 0.15 ? 'font-semibold text-neutral-900' : 'text-neutral-400'}`}>{right}</span>
                        </div>
                        <div className="relative h-[3px] rounded-full bg-neutral-100">
                          <div className="absolute left-1/2 top-1/2 h-3 w-px -translate-x-1/2 -translate-y-1/2 bg-neutral-300" />
                          <div
                            className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-neutral-900 transition-all duration-500"
                            style={{ left: `calc(${pct}% - 6px)` }}
                          />
                        </div>
                      </button>
                      {expanded && exGroup && (
                        <div className="mt-4">
                          <p className="text-[13px] leading-6 text-neutral-500">
                            {POLE_EXPLANATIONS[key][score >= 0 ? 'right' : 'left']}
                          </p>
                          <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
                            {exGroup.examples.map(example => (
                              <div key={example.artwork_id} className="w-[120px] shrink-0">
                                <div className="h-[120px] overflow-hidden rounded-2xl bg-neutral-100">
                                  {example.photo_url ? (
                                    <img src={example.photo_url} alt={example.artwork_name} className="h-full w-full object-cover" />
                                  ) : (
                                    <div className="flex h-full items-center justify-center text-[11px] text-neutral-300">No image</div>
                                  )}
                                </div>
                                <p className="mt-2 truncate text-[12px] font-medium text-neutral-900">{example.artwork_name}</p>
                                <p className="truncate text-[11px] text-neutral-400">{example.artist_name}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default TasteProfileView;
