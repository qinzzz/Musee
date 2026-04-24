import React, { useState, useRef, useCallback, useEffect } from 'react';
import { GalleryItem, ArtworkSkill, SkillCategory } from '../types';
import { selectArtworkSkills, fetchSkillObservation, fetchSkillDeepDive } from '../apiService';

// ── Category colors ────────────────────────────────────────────────────────────

const CAT_STYLE: Record<SkillCategory, { bg: string; color: string }> = {
  PERCEPTION: { bg: '#EEEDFE', color: '#3C3489' },
  HISTORY:    { bg: '#E1F5EE', color: '#085041' },
  INTENT:     { bg: '#FAECE7', color: '#712B13' },
  STRUCTURE:  { bg: '#e6f1fb', color: '#0C447C' },
  RESONANCE:  { bg: '#FAEEDA', color: '#633806' },
};

// ── Message types ─────────────────────────────────────────────────────────────

interface MsgSys  { type: 'sys';         id: number; text: string }
interface MsgObs  { type: 'obs';         id: number; text: string; label: string; skillIdx: number; obsIdx: number }
interface MsgDeep { type: 'deep';        id: number; text: string; label: string; question: string; userNote?: string }
interface MsgResp { type: 'responses';   id: number; respFor: number; skillIdx: number; obsIdx: number; isLast: boolean }
interface MsgPick { type: 'pickAnother'; id: number; respFor: number }
interface MsgSep  { type: 'sep';         id: number }

type Msg = MsgSys | MsgObs | MsgDeep | MsgResp | MsgPick | MsgSep;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MsgInput = { type: string } & Record<string, any>;

// ── Persistence ───────────────────────────────────────────────────────────────

interface PersistedState {
  skills: ArtworkSkill[];
  messages: Msg[];
  usedSkillIds: number[];
  heartedIds: number[];
  lockedResponseIds: number[];
  done: boolean;
  maxMsgId: number;
}

function storageKey(itemId: string) {
  return `musee_explore_v2_${itemId}`;
}

function loadPersistedState(itemId: string): PersistedState | null {
  try {
    const raw = localStorage.getItem(storageKey(itemId));
    if (!raw) return null;
    return JSON.parse(raw) as PersistedState;
  } catch {
    return null;
  }
}

function savePersistedState(itemId: string, state: PersistedState) {
  try {
    localStorage.setItem(storageKey(itemId), JSON.stringify(state));
  } catch {
    // quota exceeded or private browsing — silently skip
  }
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  item: GalleryItem;
}

// ── Subcomponents ─────────────────────────────────────────────────────────────

function TypingDots() {
  return (
    <div style={{ display: 'flex', gap: 5, alignItems: 'center', padding: '0.5rem 0 1rem' }}>
      {[0, 180, 360].map((delay) => (
        <div
          key={delay}
          style={{
            width: 5, height: 5, background: '#9a9590', borderRadius: '50%',
            animation: `explore-tp 1.1s ease-in-out ${delay}ms infinite`,
          }}
        />
      ))}
    </div>
  );
}

function SkillChip({
  skill, onClick, disabled,
}: {
  skill: Pick<ArtworkSkill, 'name' | 'desc' | 'cat'>;
  onClick: () => void;
  disabled: boolean;
}) {
  const cs = CAT_STYLE[skill.cat] ?? CAT_STYLE.STRUCTURE;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="explore-chip"
      style={{
        width: '100%', padding: '.7rem .9rem',
        background: disabled ? '#f9f8f6' : '#fff',
        border: '0.5px solid rgba(26,23,20,0.12)', borderRadius: 4,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontFamily: "'Noto Serif SC', 'Georgia', serif", textAlign: 'left',
        transition: 'opacity 0.2s',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: '#1a1714' }}>{skill.name}</span>
        <span style={{ fontSize: 10, color: '#9a9590', fontFamily: 'monospace' }}>{skill.desc}</span>
      </div>
      <span style={{
        fontFamily: 'monospace', fontSize: 9, letterSpacing: '.06em',
        padding: '2px 6px', borderRadius: 2,
        background: cs.bg, color: cs.color, flexShrink: 0, marginLeft: 8,
      }}>
        {skill.cat}
      </span>
    </button>
  );
}

function ActionBtn({
  children, onClick, disabled, primary = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
  primary?: boolean;
}) {
  return (
    <button
      className="explore-action-btn"
      disabled={disabled}
      onClick={onClick}
      style={{
        width: '100%', padding: '.65rem .9rem',
        background: 'transparent',
        border: primary ? '0.5px solid rgba(26,23,20,0.38)' : '0.5px solid rgba(26,23,20,0.14)',
        borderRadius: 3, fontFamily: "'Noto Serif SC', 'Georgia', serif", fontSize: 13,
        color: '#1a1714', cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.3 : 1, textAlign: 'left',
        display: 'flex', alignItems: 'center', gap: 4,
        transition: 'opacity 0.2s',
      }}
    >
      {children}
    </button>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

const InteractiveExplorationView: React.FC<Props> = ({ item }) => {
  const [initialPersisted] = useState(() => loadPersistedState(item.id));

  const [skills, setSkills] = useState<ArtworkSkill[]>(initialPersisted?.skills ?? []);
  const [messages, setMessages] = useState<Msg[]>(initialPersisted?.messages ?? []);
  const [ready, setReady] = useState(initialPersisted != null);
  const [resetKey, setResetKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(initialPersisted?.done ?? false);
  const [usedSkills, setUsedSkills] = useState<Set<number>>(new Set(initialPersisted?.usedSkillIds ?? []));
  const [lockedResponses, setLockedResponses] = useState<Set<number>>(new Set(initialPersisted?.lockedResponseIds ?? []));
  const [heartedIds, setHeartedIds] = useState<Set<number>>(new Set(initialPersisted?.heartedIds ?? []));
  const [editingDeepId, setEditingDeepId] = useState<number | null>(null);
  const [draftNote, setDraftNote] = useState('');

  const skillsRef = useRef<ArtworkSkill[]>(initialPersisted?.skills ?? []);
  const usedSkillsRef = useRef<Set<number>>(new Set(initialPersisted?.usedSkillIds ?? []));
  const msgIdRef = useRef(initialPersisted?.maxMsgId ?? 0);
  const bottomRef = useRef<HTMLDivElement>(null);

  const nextId = () => ++msgIdRef.current;

  const scrollBottom = useCallback(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 80);
  }, []);

  const addMsg = useCallback((msg: MsgInput) => {
    const withId = { ...msg, id: nextId() } as Msg;
    setMessages(prev => [...prev, withId]);
    scrollBottom();
  }, [scrollBottom]);

  // ── Persist on every meaningful state change ───────────────────────────────
  useEffect(() => {
    if (!ready) return;
    savePersistedState(item.id, {
      skills: skillsRef.current,
      messages,
      usedSkillIds: [...usedSkillsRef.current],
      heartedIds: [...heartedIds],
      lockedResponseIds: [...lockedResponses],
      done,
      maxMsgId: msgIdRef.current,
    });
  }, [messages, heartedIds, lockedResponses, done, ready, item.id]);

  // ── Reset session (clear storage + restart) ───────────────────────────────
  function resetSession() {
    localStorage.removeItem(storageKey(item.id));
    setSkills([]); setMessages([]); setReady(false); setDone(false);
    setUsedSkills(new Set()); setLockedResponses(new Set()); setHeartedIds(new Set());
    skillsRef.current = [];
    usedSkillsRef.current = new Set();
    msgIdRef.current = 0;
    setError(null);
    setResetKey(k => k + 1);  // trigger the bootstrap effect to re-run
  }

  // ── Bootstrap: load skills on mount (only when no persisted state) ─────────
  useEffect(() => {
    if (ready) return;  // already restored from storage
    let cancelled = false;
    async function loadSkills() {
      setLoading(true);
      setError(null);
      try {
        const raw = await selectArtworkSkills(item.url, item.artistName, item.artworkName);
        if (cancelled) return;
        const loaded: ArtworkSkill[] = raw.map((s, i) => ({ ...s, id: i, observations: [], more: null }));
        setSkills(loaded);
        skillsRef.current = loaded;
        setReady(true);
        // Prefetch first observation for all skills — results go into cache so user taps are instant
        raw.forEach(s => fetchSkillObservation(s.name, s.desc, [], item.url, item.artworkId));
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Failed to load. Try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadSkills();
    return () => { cancelled = true; };
  // item.artistName/artworkName are optional hints — don't re-fire when they arrive after streaming
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.url, resetKey]);

  // ── Pick a skill ───────────────────────────────────────────────────────────
  async function pickSkill(idx: number) {
    const newUsed = new Set([...usedSkillsRef.current, idx]);
    usedSkillsRef.current = newUsed;
    setUsedSkills(new Set(newUsed));
    addMsg({ type: 'sep' });
    setLoading(true);
    try {
      const skill = skillsRef.current[idx];
      // Kick off deep-dive prefetch in parallel — result cached for when user taps "Tell me more"
      fetchSkillDeepDive(skill.name, skill.desc, item.url, item.artworkId);
      const obs = await fetchSkillObservation(skill.name, skill.desc, [], item.url, item.artworkId);
      const updated = [...skillsRef.current];
      updated[idx] = { ...updated[idx], observations: [obs] };
      skillsRef.current = updated;
      setSkills([...updated]);
      const obsId = nextId();
      setMessages(prev => [...prev, { type: 'obs', id: obsId, text: obs, label: skill.name, skillIdx: idx, obsIdx: 0 } as MsgObs]);
      addMsg({ type: 'responses', respFor: obsId, skillIdx: idx, obsIdx: 0, isLast: false });
    } catch {
      addMsg({ type: 'sys', text: 'Failed to load. Please try again.' });
    } finally {
      setLoading(false);
      scrollBottom();
    }
  }

  // ── "+1" toggle — pure reaction, no fetch, no lock ─────────────────────────
  function toggleHeart(obsId: number) {
    setHeartedIds(prev => {
      const next = new Set(prev);
      next.has(obsId) ? next.delete(obsId) : next.add(obsId);
      return next;
    });
  }

  // ── "Tell me more" ─────────────────────────────────────────────────────────
  async function onMore(respId: number, skillIdx: number) {
    setLockedResponses(prev => new Set([...prev, respId]));
    const skill = skillsRef.current[skillIdx];
    setLoading(true);
    try {
      let text: string, question: string;
      if (skill.more) {
        ({ text, question } = skill.more);
      } else {
        const result = await fetchSkillDeepDive(skill.name, skill.desc, item.url, item.artworkId);
        text = result.text; question = result.question;
        const updated = [...skillsRef.current];
        updated[skillIdx] = { ...updated[skillIdx], more: { text, question, label: skill.name } };
        skillsRef.current = updated;
        setSkills([...updated]);
      }
      addMsg({ type: 'deep', text, label: skill.name, question });
      const deepId = msgIdRef.current;
      const available = skillsRef.current.filter((_, i) => !usedSkillsRef.current.has(i));
      if (available.length > 0) addMsg({ type: 'pickAnother', respFor: deepId });
      else { addMsg({ type: 'sep' }); setDone(true); }
    } catch {
      addMsg({ type: 'sys', text: 'Failed to load. Please try again.' });
    } finally {
      setLoading(false);
    }
  }


  // ── Save a note on a deep-dive question ────────────────────────────────────
  function saveNote(deepId: number) {
    const note = draftNote.trim();
    setMessages(prev => prev.map(m =>
      m.id === deepId ? { ...m, userNote: note || undefined } as MsgDeep : m
    ));
    setEditingDeepId(null);
    setDraftNote('');
  }

  // ── Render messages ────────────────────────────────────────────────────────
  const availableSkills = skills.filter((_, i) => !usedSkills.has(i));

  function renderMsg(msg: Msg) {
    const locked = lockedResponses.has(msg.id) || ('respFor' in msg && lockedResponses.has((msg as any).respFor));

    switch (msg.type) {
      case 'sys':
        return (
          <p key={msg.id} style={{ fontSize: 14, lineHeight: 1.85, fontWeight: 300, color: '#1a1714', marginBottom: '1.25rem' }}>
            {msg.text}
          </p>
        );

      case 'sep':
        return <div key={msg.id} style={{ width: '100%', height: '0.5px', background: 'rgba(26,23,20,0.1)', margin: '.2rem 0 1.25rem' }} />;

      case 'obs': {
        const obsMsg = msg as MsgObs;
        const isHearted = heartedIds.has(msg.id);
        return (
          <div key={msg.id} style={{ marginBottom: '1.25rem' }}>
            <div style={{
              fontFamily: 'monospace', fontSize: 9, letterSpacing: '.08em',
              color: '#9a9590', textTransform: 'uppercase' as const,
              display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6,
            }}>
              <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#c4440a', flexShrink: 0, display: 'inline-block' }} />
              {obsMsg.label}
              {isHearted && <span style={{ marginLeft: 4, fontSize: 10 }}>♥</span>}
            </div>
            <p style={{ fontSize: 14, lineHeight: 1.85, fontWeight: 300, color: '#1a1714' }}>{obsMsg.text}</p>
          </div>
        );
      }

      case 'deep': {
        const deepMsg = msg as MsgDeep;
        const isEditing = editingDeepId === msg.id;
        return (
          <div key={msg.id} style={{ background: '#faf9f7', border: '0.5px solid rgba(26,23,20,0.1)', borderRadius: 4, padding: '1rem 1.1rem', marginBottom: '1.25rem' }}>
            <div style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: '.08em', color: '#9a9590', textTransform: 'uppercase' as const, display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
              <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#c4440a', flexShrink: 0, display: 'inline-block' }} />
              {deepMsg.label}
            </div>
            <p style={{ fontSize: 14, lineHeight: 1.85, fontWeight: 300, color: '#1a1714' }}>{deepMsg.text}</p>

            {/* Question footer — tap to answer */}
            <div
              style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '0.5px solid rgba(26,23,20,0.1)' }}
              onClick={() => { if (!isEditing) { setDraftNote(deepMsg.userNote ?? ''); setEditingDeepId(msg.id); } }}
            >
              <p style={{ fontSize: 13, fontStyle: 'italic', color: '#9a9590', lineHeight: 1.7, marginBottom: deepMsg.userNote || isEditing ? '0.65rem' : 0 }}>
                {deepMsg.question}
              </p>

              {/* Saved note display */}
              {deepMsg.userNote && !isEditing && (
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <p style={{ fontSize: 13, color: '#1a1714', lineHeight: 1.75, fontWeight: 300, flex: 1 }}>{deepMsg.userNote}</p>
                  <button
                    onClick={e => { e.stopPropagation(); setDraftNote(deepMsg.userNote ?? ''); setEditingDeepId(msg.id); }}
                    style={{ fontFamily: 'monospace', fontSize: 9, color: '#9a9590', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, padding: '2px 0', textTransform: 'uppercase' as const, letterSpacing: '.06em' }}
                  >
                    edit
                  </button>
                </div>
              )}

              {/* Tap hint when no note yet */}
              {!deepMsg.userNote && !isEditing && (
                <div style={{ fontFamily: 'monospace', fontSize: 9, color: '#c4b8a8', letterSpacing: '.06em', textTransform: 'uppercase' as const, cursor: 'pointer' }}>
                  tap to write your answer
                </div>
              )}

              {/* Inline editor */}
              {isEditing && (
                <div onClick={e => e.stopPropagation()}>
                  <textarea
                    autoFocus
                    value={draftNote}
                    onChange={e => setDraftNote(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveNote(msg.id); if (e.key === 'Escape') { setEditingDeepId(null); setDraftNote(''); } }}
                    placeholder="Write your answer…"
                    style={{
                      width: '100%', minHeight: 72, padding: '0.5rem 0.6rem',
                      fontFamily: "'Noto Serif SC', 'Georgia', serif", fontSize: 13,
                      lineHeight: 1.75, color: '#1a1714',
                      background: '#fff', border: '0.5px solid rgba(26,23,20,0.2)',
                      borderRadius: 3, resize: 'vertical', outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                  <div style={{ display: 'flex', gap: 8, marginTop: 6, justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => { setEditingDeepId(null); setDraftNote(''); }}
                      style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: '.06em', textTransform: 'uppercase' as const, color: '#9a9590', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px' }}
                    >
                      cancel
                    </button>
                    <button
                      onClick={() => saveNote(msg.id)}
                      style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: '.06em', textTransform: 'uppercase' as const, color: '#f5f2ed', background: '#1a1714', border: 'none', borderRadius: 2, cursor: 'pointer', padding: '4px 10px' }}
                    >
                      save
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      }

      case 'responses': {
        const respMsg = msg as MsgResp;
        const isHearted = heartedIds.has(respMsg.respFor);
        return (
          <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => toggleHeart(respMsg.respFor)}
                style={{
                  padding: '0 1rem', height: 38, flexShrink: 0,
                  fontFamily: "'Noto Serif SC', 'Georgia', serif", fontSize: 13,
                  borderRadius: 3, border: '0.5px solid',
                  cursor: 'pointer', transition: 'all 0.15s',
                  background: isHearted ? '#1a1714' : 'transparent',
                  borderColor: isHearted ? '#1a1714' : 'rgba(26,23,20,0.2)',
                  color: isHearted ? '#f5f2ed' : '#1a1714',
                }}
              >
                +1
              </button>
              <ActionBtn primary disabled={locked} onClick={() => onMore(respMsg.respFor, respMsg.skillIdx)}>
                Tell me more →
              </ActionBtn>
            </div>

            {availableSkills.length > 0 && (
              <>
                <div style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: '.08em', color: '#9a9590', textTransform: 'uppercase' as const, padding: '.3rem 0 .1rem' }}>
                  Explore another angle
                </div>
                {availableSkills.map((s, availIdx) => {
                  const idx = skills.indexOf(s);
                  const cs = CAT_STYLE[s.cat] ?? CAT_STYLE.STRUCTURE;
                  return (
                    <button
                      key={availIdx}
                      disabled={locked}
                      className="explore-chip"
                      onClick={() => { setLockedResponses(prev => new Set([...prev, respMsg.respFor])); pickSkill(idx); }}
                      style={{
                        width: '100%', padding: '.65rem .9rem',
                        background: locked ? '#f9f8f6' : '#fff',
                        border: '0.5px solid rgba(26,23,20,0.12)', borderRadius: 4,
                        cursor: locked ? 'not-allowed' : 'pointer', opacity: locked ? 0.35 : 1,
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        fontFamily: "'Noto Serif SC', 'Georgia', serif", textAlign: 'left',
                        transition: 'opacity 0.2s',
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: '#1a1714' }}>{s.name}</span>
                        <span style={{ fontSize: 10, color: '#9a9590', fontFamily: 'monospace' }}>{s.desc}</span>
                      </div>
                      <span style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: '.06em', padding: '2px 6px', borderRadius: 2, background: cs.bg, color: cs.color, flexShrink: 0, marginLeft: 8 }}>
                        {s.cat}
                      </span>
                    </button>
                  );
                })}
              </>
            )}
          </div>
        );
      }

      case 'pickAnother': {
        const pickMsg = msg as MsgPick;
        if (availableSkills.length === 0) return null;
        return (
          <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: '1.25rem' }}>
            <div style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: '.08em', color: '#9a9590', textTransform: 'uppercase' as const, padding: '.3rem 0 .1rem' }}>Explore another angle</div>
            {availableSkills.map(s => {
              const idx = skills.indexOf(s);
              return (
                <ActionBtn key={idx} disabled={locked} onClick={() => { setLockedResponses(prev => new Set([...prev, pickMsg.respFor])); pickSkill(idx); }}>
                  <span style={{ fontWeight: 500 }}>{s.name}</span>
                  <span style={{ fontSize: 10, color: '#9a9590', fontFamily: 'monospace', flex: 1, marginLeft: 8 }}>{s.desc}</span>
                  <span style={{ color: '#9a9590', fontSize: 11 }}>→</span>
                </ActionBtn>
              );
            })}
          </div>
        );
      }

      default: return null;
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem 1.25rem 4rem', fontFamily: "'Noto Serif SC', 'Georgia', serif", background: '#faf9f7', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @keyframes explore-tp {
          0%,80%,100%{opacity:.2;transform:scale(.7)}40%{opacity:1;transform:scale(1)}
        }
        .explore-chip:hover:not(:disabled) { background: #f0efe9 !important; }
        .explore-action-btn:hover:not(:disabled) { background: rgba(26,23,20,0.04) !important; border-color: rgba(26,23,20,0.3) !important; }
      `}</style>

      {/* Loading state */}
      {loading && !ready && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 8 }}>
          <TypingDots />
          <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#9a9590', letterSpacing: '.08em', textTransform: 'uppercase' }}>Finding angles…</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#c4440a', padding: '.65rem .9rem', border: '0.5px solid #c4440a', borderRadius: 3, marginBottom: '1.25rem' }}>
          {error}
        </div>
      )}

      {/* Skill chips — always at top once loaded */}
      {ready && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.6rem' }}>
            <div style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: '.08em', color: '#9a9590', textTransform: 'uppercase' as const }}>
              {usedSkills.size > 0 ? `${usedSkills.size} of ${skills.length} explored` : 'Pick the angle you\'re most curious about'}
            </div>
            {messages.length > 0 && (
              <button
                onClick={resetSession}
                style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: '.06em', color: '#9a9590', background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 0 8px', textTransform: 'uppercase' as const }}
              >
                start over ↺
              </button>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {skills.map((s, i) => (
              <SkillChip
                key={i}
                skill={s}
                disabled={usedSkills.has(i) || loading}
                onClick={() => !usedSkills.has(i) && !loading && pickSkill(i)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Flow messages */}
      {messages.map(renderMsg)}

      {/* In-flow loading indicator */}
      {ready && loading && <TypingDots />}

      {/* Done screen */}
      {done && (
        <div style={{ textAlign: 'center', paddingTop: '1.5rem', paddingBottom: '1rem' }}>
          <div style={{ width: '100%', height: '0.5px', background: 'rgba(26,23,20,0.1)', margin: '0 0 1.5rem' }} />
          <p style={{ fontSize: 14, lineHeight: 1.85, fontWeight: 300, color: '#1a1714', marginBottom: '.75rem' }}>
            You've explored this work from {skills.length} angles.
          </p>
          <p style={{ fontFamily: 'monospace', fontSize: 11, color: '#9a9590', letterSpacing: '.04em', marginBottom: '1.5rem' }}>
            Put your phone down and look at it for one more minute.
          </p>
          <button
            onClick={resetSession}
            style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: '.06em', color: '#9a9590', background: 'none', border: '0.5px solid rgba(26,23,20,0.2)', borderRadius: 2, cursor: 'pointer', padding: '5px 12px', textTransform: 'uppercase' as const }}
          >
            Start over ↺
          </button>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
};

export default InteractiveExplorationView;
