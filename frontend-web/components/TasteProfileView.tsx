import React, { useState, useEffect } from 'react';
import { getTasteProfile } from '../apiService';

const DIMENSIONS = [
  { key: 'figurative_abstract',  left: '具象', right: '抽象' },
  { key: 'emotive_conceptual',   left: '感性', right: '理性' },
  { key: 'serene_intense',       left: '宁静', right: '张力' },
  { key: 'classical_avantgarde', left: '经典', right: '先锋' },
  { key: 'playful_serious',      left: '玩味', right: '严肃' },
];

// Why-I-lean explanations per pole
const POLE_EXPLANATIONS: Record<string, Record<string, string>> = {
  figurative_abstract: {
    left:  '你偏爱可辨认的形象——人物、物体、叙事。抽象形式对你吸引力较弱。',
    right: '你被抽象语言吸引——形式、色彩与空间本身即是意义，无需具体可辨的形象。',
  },
  emotive_conceptual: {
    left:  '你被感性的、情绪直接的作品打动，情感共鸣优先于概念构建。',
    right: '你倾向于理性导向的作品——概念、系统与观念的重量超过纯粹的情绪冲击。',
  },
  serene_intense: {
    left:  '你的收藏整体沉静内敛，偏爱平衡与安宁，而非视觉张力。',
    right: '你被强烈的视觉张力吸引——冲突、能量与不安定感是你审美中的核心成分。',
  },
  classical_avantgarde: {
    left:  '你欣赏传统与经典——技艺、历史感与延续性在你的审美中占重要位置。',
    right: '你持续被打破惯例的实践吸引——先锋、实验与对传统的挑战构成你的审美坐标。',
  },
  playful_serious: {
    left:  '你喜爱轻盈与游戏感，艺术可以幽默、颠覆，甚至故意不严肃。',
    right: '你偏爱沉重、严肃与深刻——作品应当承载重量，而非轻浮滑过。',
  },
};

interface DimExample {
  artwork_id: string;
  photo_url: string | null;
  artist_name: string;
  artwork_name: string;
  dim_score: number;
}

interface DimExampleGroup {
  dominant_pole: string;
  other_pole: string;
  examples: DimExample[];
}

interface Props {
  userId: string;
}

const TasteProfileView: React.FC<Props> = ({ userId }) => {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expandedDim, setExpandedDim] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getTasteProfile(userId)
      .then(setProfile)
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
  }, [userId]);

  if (loading) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bbb', fontFamily: 'Georgia, serif', fontSize: 13 }}>
        Loading…
      </div>
    );
  }

  const archetype = profile?.archetype;
  const dims: Record<string, number> = profile?.dimension_scores ?? {};
  const dimExamples: Record<string, DimExampleGroup> = profile?.dimension_examples ?? {};
  const analyzedCount: number = profile?.analyzed_count ?? 0;
  const totalArtworks: number = profile?.total_artworks ?? 0;
  const minSample: number = profile?.min_sample ?? 5;
  const isReady = profile?.status === 'ready';

  return (
    <div style={{
      height: '100%',
      overflowY: 'auto',
      padding: '2.5rem 1.75rem 5rem',
      fontFamily: "'Noto Serif SC', Georgia, serif",
      background: '#faf9f7',
    }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>

        {/* Section label */}
        <div style={{ fontSize: 9, fontFamily: 'monospace', letterSpacing: '.2em', textTransform: 'uppercase', color: '#bbb', marginBottom: '2rem' }}>
          Art Personality
        </div>

        {!isReady ? (
          <div>
            <div style={{ fontSize: 22, fontWeight: 500, color: '#1a1714', marginBottom: 12, lineHeight: 1.3 }}>
              Your profile is taking shape
            </div>
            <p style={{ fontSize: 13, color: '#888', lineHeight: 1.8, marginBottom: '2rem' }}>
              Your art personality emerges after {minSample} artworks are matched to known works. You have {analyzedCount} of {minSample} so far.
            </p>

            {/* Progress bar */}
            <div style={{ marginBottom: '2rem' }}>
              <div style={{ height: 2, background: '#e8e4df', borderRadius: 1, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${Math.min(100, (analyzedCount / minSample) * 100)}%`,
                  background: '#1a1714',
                  borderRadius: 1,
                  transition: 'width 0.6s ease',
                }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10, fontFamily: 'monospace', color: '#bbb', letterSpacing: '.08em' }}>
                <span>{analyzedCount} matched</span>
                <span>{minSample} needed</span>
              </div>
            </div>

            <p style={{ fontSize: 12, color: '#aaa', lineHeight: 1.7 }}>
              Keep adding artworks with known artists and titles — each recognized work deepens your profile.
            </p>
          </div>
        ) : (
          <>
            {/* Archetype identity */}
            <div style={{ marginBottom: '2.5rem' }}>
              <div style={{ fontSize: 36, fontWeight: 600, color: '#1a1714', lineHeight: 1.15, marginBottom: 4 }}>
                {archetype?.name}
              </div>
              <div style={{ fontSize: 13, fontFamily: 'monospace', letterSpacing: '.12em', textTransform: 'uppercase', color: '#bbb', marginBottom: '1.5rem' }}>
                {archetype?.name_en}
              </div>

              <p style={{ fontSize: 14, color: '#3a3530', lineHeight: 1.9, marginBottom: '1.25rem' }}>
                {archetype?.description}
              </p>

              <div style={{ fontSize: 11, color: '#aaa', fontFamily: 'monospace', letterSpacing: '.06em' }}>
                Representative: {archetype?.representative}
              </div>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: '#e8e4df', marginBottom: '2rem' }} />

            {/* Dimension bars */}
            <div style={{ marginBottom: '2.5rem' }}>
              <div style={{ fontSize: 9, fontFamily: 'monospace', letterSpacing: '.2em', textTransform: 'uppercase', color: '#bbb', marginBottom: '1.25rem' }}>
                Aesthetic Dimensions
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {DIMENSIONS.map(({ key, left, right }) => {
                  const score = dims[key] ?? 0;
                  const pct = ((score + 1) / 2) * 100;
                  const exGroup = dimExamples[key];
                  const isExpanded = expandedDim === key;
                  const hasExamples = exGroup && exGroup.examples.length > 0;

                  return (
                    <div key={key}>
                      {/* Clickable row */}
                      <div
                        onClick={() => hasExamples && setExpandedDim(isExpanded ? null : key)}
                        style={{
                          padding: '1rem 0',
                          cursor: hasExamples ? 'pointer' : 'default',
                          borderBottom: isExpanded ? 'none' : '1px solid transparent',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
                          <span style={{ fontSize: 11, color: score < -0.15 ? '#1a1714' : '#bbb', fontWeight: score < -0.15 ? 600 : 400, transition: 'all 0.3s', letterSpacing: '.04em' }}>
                            {left}
                          </span>
                          {hasExamples && (
                            <span style={{ fontSize: 9, fontFamily: 'monospace', color: '#ccc', letterSpacing: '.08em' }}>
                              {isExpanded ? '▲' : '▼'}
                            </span>
                          )}
                          <span style={{ fontSize: 11, color: score > 0.15 ? '#1a1714' : '#bbb', fontWeight: score > 0.15 ? 600 : 400, transition: 'all 0.3s', letterSpacing: '.04em' }}>
                            {right}
                          </span>
                        </div>
                        <div style={{ position: 'relative', height: 2, background: '#e8e4df', borderRadius: 1 }}>
                          <div style={{ position: 'absolute', left: '50%', top: -3, width: 1, height: 8, background: '#d5d0cb', transform: 'translateX(-50%)' }} />
                          <div style={{
                            position: 'absolute',
                            left: `${pct}%`,
                            top: '50%',
                            transform: 'translate(-50%, -50%)',
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            background: '#1a1714',
                            transition: 'left 0.6s ease',
                          }} />
                        </div>
                      </div>

                      {/* Expanded panel */}
                      {isExpanded && exGroup && (
                        <div style={{
                          padding: '0 0 1.25rem',
                          borderBottom: '1px solid #e8e4df',
                          marginBottom: '0.25rem',
                        }}>
                          {/* Why explanation */}
                          <p style={{ fontSize: 12, color: '#666', lineHeight: 1.7, marginBottom: '1rem', fontStyle: 'italic' }}>
                            {POLE_EXPLANATIONS[key]?.[score >= 0 ? 'right' : 'left']}
                          </p>

                          {/* Artwork thumbnails */}
                          <div style={{ display: 'flex', gap: '0.75rem', overflowX: 'auto', paddingBottom: 4 }}>
                            {exGroup.examples.map((ex) => (
                              <div key={ex.artwork_id} style={{ flexShrink: 0, width: 100 }}>
                                <div style={{
                                  width: 100,
                                  height: 100,
                                  borderRadius: 6,
                                  overflow: 'hidden',
                                  background: '#e8e4df',
                                  marginBottom: 6,
                                }}>
                                  {ex.photo_url ? (
                                    <img
                                      src={ex.photo_url}
                                      alt={ex.artwork_name}
                                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    />
                                  ) : (
                                    <div style={{ width: '100%', height: '100%', background: '#e0dbd5' }} />
                                  )}
                                </div>
                                <div style={{ fontSize: 10, color: '#888', lineHeight: 1.3, letterSpacing: '.02em' }}>
                                  {ex.artist_name}
                                </div>
                                <div style={{ fontSize: 10, color: '#bbb', lineHeight: 1.3, marginTop: 1 }}>
                                  {ex.artwork_name.length > 28 ? ex.artwork_name.slice(0, 26) + '…' : ex.artwork_name}
                                </div>
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

            {/* Divider */}
            <div style={{ height: 1, background: '#e8e4df', marginBottom: '1.5rem' }} />

            {/* Stats footer */}
            <div style={{ display: 'flex', gap: '2rem' }}>
              {[
                { label: 'Artworks', value: totalArtworks },
                { label: 'Analyzed', value: analyzedCount },
              ].map(s => (
                <div key={s.label}>
                  <div style={{ fontSize: 20, fontWeight: 600, color: '#1a1714', lineHeight: 1 }}>{s.value}</div>
                  <div style={{ fontSize: 9, fontFamily: 'monospace', letterSpacing: '.12em', textTransform: 'uppercase', color: '#bbb', marginTop: 4 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {profile?.low_sample_warning && (
              <p style={{ fontSize: 11, color: '#bbb', marginTop: '1rem', lineHeight: 1.6 }}>
                Profile based on {analyzedCount} artworks — will sharpen as your collection grows.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default TasteProfileView;
