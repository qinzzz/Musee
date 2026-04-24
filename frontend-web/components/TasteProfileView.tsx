import React, { useState, useEffect } from 'react';
import { getTasteProfile } from '../apiService';

type SkillCategory = 'PERCEPTION' | 'HISTORY' | 'INTENT' | 'STRUCTURE' | 'RESONANCE';

const CAT_STYLE: Record<SkillCategory, { bg: string; border: string; nameColor: string; dotColor: string; label: string }> = {
  PERCEPTION: { bg: '#EEEDFE', border: '#AFA9EC', nameColor: '#3C3489', dotColor: '#7F77DD', label: 'Perception' },
  HISTORY:    { bg: '#E1F5EE', border: '#5DCAA5', nameColor: '#085041', dotColor: '#1D9E75', label: 'History' },
  INTENT:     { bg: '#FAECE7', border: '#F0997B', nameColor: '#712B13', dotColor: '#D85A30', label: 'Intent' },
  STRUCTURE:  { bg: '#E6F1FB', border: '#85B7EB', nameColor: '#0C447C', dotColor: '#378ADD', label: 'Structure' },
  RESONANCE:  { bg: '#FAEEDA', border: '#EF9F27', nameColor: '#633806', dotColor: '#BA7517', label: 'Resonance' },
};

const SKILLS_BY_CAT: Record<SkillCategory, string[]> = {
  PERCEPTION: ['Color Tension', 'Compositional Pull', 'Materiality', 'Scale & Presence', 'Detail Hunter'],
  HISTORY:    ['Art Movement', 'Lineage', 'Historical Context', 'Collection & Market', 'Legacy'],
  INTENT:     ['Life Traces', 'Argument', 'Obsession', 'Ambition', 'The Specific'],
  STRUCTURE:  ['Hidden Mechanism', 'Contradiction', 'Absence & Silence', 'Controlled Looking', 'Temporality', 'Site'],
  RESONANCE:  ['Personal Memory', 'Gut Response', 'Ethical Discomfort', 'Wider Resonance', 'Ineffable'],
};

const CATEGORIES: SkillCategory[] = ['PERCEPTION', 'HISTORY', 'INTENT', 'STRUCTURE', 'RESONANCE'];

const PERIOD_ORDER = ['Historical', 'Modern', 'Contemporary', 'Now'];

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
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', fontFamily: 'Georgia, serif', fontSize: 14 }}>
        Loading…
      </div>
    );
  }

  const skillStats: Record<string, { observations: number; deepdives: number; xp: number; level: number }> = profile?.skill_stats ?? {};
  const dominantCat = profile?.dominant_category as SkillCategory | null;
  const catStyle = dominantCat ? CAT_STYLE[dominantCat] : null;

  const sortedPeriods = [...(profile?.top_periods ?? [])].sort(
    (a: any, b: any) => PERIOD_ORDER.indexOf(a.period) - PERIOD_ORDER.indexOf(b.period)
  );

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '1.5rem 1.5rem 4rem', fontFamily: "'Noto Serif SC', 'Georgia', serif", background: '#faf9f7' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>

        {/* Identity header */}
        <div style={{
          padding: '1.5rem 1.75rem',
          borderRadius: 12,
          background: catStyle?.bg ?? '#f3f2f0',
          border: `1px solid ${catStyle?.border ?? '#e0dbd5'}`,
          marginBottom: '1.75rem',
        }}>
          {profile?.total_explore_events === 0 ? (
            <div>
              <div style={{ fontSize: 11, fontFamily: 'monospace', letterSpacing: '.12em', textTransform: 'uppercase', color: '#aaa', marginBottom: 8 }}>
                Your taste profile
              </div>
              <div style={{ fontSize: 20, fontWeight: 500, color: '#1a1714', marginBottom: 6 }}>
                Not yet revealed
              </div>
              <div style={{ fontSize: 13, color: '#888', lineHeight: 1.65 }}>
                Use Interactive mode to explore artworks — each skill you engage builds your profile.
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 11, fontFamily: 'monospace', letterSpacing: '.12em', textTransform: 'uppercase', color: catStyle?.dotColor ?? '#999', marginBottom: 8 }}>
                {dominantCat ?? 'Mixed'}
              </div>
              <div style={{ fontSize: 26, fontWeight: 600, color: '#1a1714', marginBottom: 6 }}>
                {profile?.identity_label}
              </div>
              <div style={{ fontSize: 14, color: '#555', lineHeight: 1.65 }}>
                {profile?.identity_description}
              </div>
            </div>
          )}

          {/* Stat row */}
          <div style={{ display: 'flex', gap: 24, marginTop: 20 }}>
            {[
              { label: 'Artworks', value: profile?.total_artworks ?? 0 },
              { label: 'Explorations', value: profile?.total_explore_events ?? 0 },
            ].map(s => (
              <div key={s.label}>
                <div style={{ fontSize: 22, fontWeight: 600, color: '#1a1714', lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 10, fontFamily: 'monospace', letterSpacing: '.1em', textTransform: 'uppercase', color: '#aaa', marginTop: 3 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Collection: movements + periods */}
        {(profile?.top_movements?.length > 0 || sortedPeriods.length > 0) && (
          <div style={{ marginBottom: '1.75rem' }}>
            <div style={{ fontSize: 10, fontFamily: 'monospace', letterSpacing: '.12em', textTransform: 'uppercase', color: '#aaa', marginBottom: 12 }}>
              Your collection
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {profile?.top_movements?.map((m: any) => (
                <span key={m.movement} style={{
                  padding: '5px 12px', borderRadius: 20, fontSize: 12,
                  background: '#fff', border: '1px solid #e0dbd5', color: '#3a3530',
                }}>
                  {m.movement} <span style={{ color: '#aaa', fontSize: 10 }}>{m.count}</span>
                </span>
              ))}
            </div>
            {sortedPeriods.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                {sortedPeriods.map((p: any) => (
                  <span key={p.period} style={{
                    padding: '4px 10px', borderRadius: 20, fontSize: 11,
                    background: 'transparent', border: '1px solid #d5d0cb', color: '#888',
                  }}>
                    {p.period} · {p.count}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Skills grid with real XP levels */}
        <div style={{ fontSize: 10, fontFamily: 'monospace', letterSpacing: '.12em', textTransform: 'uppercase', color: '#aaa', marginBottom: 14 }}>
          Skill levels
        </div>
        {CATEGORIES.map((cat, i) => {
          const cs = CAT_STYLE[cat];
          const names = SKILLS_BY_CAT[cat];
          return (
            <div key={cat} style={{
              display: 'flex', alignItems: 'stretch', gap: 10,
              borderTop: i > 0 ? '1px solid #e8e4df' : 'none',
              paddingTop: i > 0 ? '1.25rem' : 0,
              paddingBottom: '1.25rem',
            }}>
              <div style={{ width: 120, flexShrink: 0, display: 'flex', alignItems: 'center', paddingRight: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: cs.nameColor, textTransform: 'uppercase', lineHeight: 1.2 }}>
                  {cs.label}
                </span>
              </div>
              <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${names.length}, 1fr)`, gap: 8 }}>
                {names.map(name => {
                  const stat = skillStats[name];
                  const level = stat?.level ?? 0;
                  return (
                    <div key={name} style={{
                      padding: '14px 10px 12px',
                      borderRadius: 10,
                      background: level > 0 ? cs.bg : '#f5f4f2',
                      border: `1px solid ${level > 0 ? cs.border : '#e4e0db'}`,
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                      justifyContent: 'space-between', gap: 8, textAlign: 'center',
                    }}>
                      <span style={{ fontSize: 11, fontWeight: 500, color: level > 0 ? cs.nameColor : '#bbb', lineHeight: 1.4 }}>
                        {name}
                      </span>
                      <span style={{ display: 'flex', gap: 3 }}>
                        {[0, 1, 2, 3, 4].map(j => (
                          <span key={j} style={{
                            display: 'inline-block', width: 6, height: 6,
                            borderRadius: 1, transform: 'rotate(45deg)',
                            background: j < level ? cs.dotColor : 'transparent',
                            border: `1.5px solid ${j < level ? cs.dotColor : (level > 0 ? cs.border : '#d5d0cb')}`,
                          }} />
                        ))}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TasteProfileView;
