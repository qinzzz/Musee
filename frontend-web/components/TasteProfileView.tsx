import React, { useState, useEffect } from 'react';
import { getTasteProfile } from '../apiService';

const DIMENSIONS = [
  { key: 'figurative_abstract',  left: '具象', right: '抽象' },
  { key: 'emotive_conceptual',   left: '感性', right: '理性' },
  { key: 'serene_intense',       left: '宁静', right: '张力' },
  { key: 'classical_avantgarde', left: '经典', right: '先锋' },
  { key: 'playful_serious',      left: '玩味', right: '严肃' },
];

interface Props {
  userId: string;
}

const TasteProfileView: React.FC<Props> = ({ userId }) => {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

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
          /* ── Insufficient data state ── */
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
          /* ── Full profile ── */
          <>
            {/* Archetype identity */}
            <div style={{ marginBottom: '2.5rem' }}>
              <div style={{ fontSize: 36, fontWeight: 600, color: '#1a1714', lineHeight: 1.15, marginBottom: 4 }}>
                {archetype?.name}
              </div>
              <div style={{ fontSize: 13, fontFamily: 'monospace', letterSpacing: '.12em', textTransform: 'uppercase', color: '#bbb', marginBottom: '1.5rem' }}>
                {archetype?.name_en}
              </div>

              <p style={{ fontSize: 14, color: '#3a3530', lineHeight: 1.9, marginBottom: '1.25rem', fontStyle: 'normal' }}>
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

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {DIMENSIONS.map(({ key, left, right }) => {
                  const score = dims[key] ?? 0;
                  // Map score (-1 to 1) to percentage (0 to 100)
                  const pct = ((score + 1) / 2) * 100;
                  return (
                    <div key={key}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}>
                        <span style={{ fontSize: 11, color: score < -0.15 ? '#1a1714' : '#bbb', fontWeight: score < -0.15 ? 600 : 400, transition: 'all 0.3s', letterSpacing: '.04em' }}>
                          {left}
                        </span>
                        <span style={{ fontSize: 11, color: score > 0.15 ? '#1a1714' : '#bbb', fontWeight: score > 0.15 ? 600 : 400, transition: 'all 0.3s', letterSpacing: '.04em' }}>
                          {right}
                        </span>
                      </div>
                      <div style={{ position: 'relative', height: 2, background: '#e8e4df', borderRadius: 1 }}>
                        {/* Center tick */}
                        <div style={{ position: 'absolute', left: '50%', top: -3, width: 1, height: 8, background: '#d5d0cb', transform: 'translateX(-50%)' }} />
                        {/* Score dot */}
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
