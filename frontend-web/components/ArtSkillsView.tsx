import React, { useState } from 'react';
import { SkillCategory } from '../types';

interface Skill {
  name: string;
  cat: SkillCategory;
  desc: string;
  example: string;
}

const CAT_STYLE: Record<SkillCategory, { bg: string; border: string; nameColor: string; dotColor: string; label: string }> = {
  PERCEPTION: { bg: '#EEEDFE', border: '#AFA9EC', nameColor: '#3C3489', dotColor: '#7F77DD', label: 'Perception' },
  HISTORY:    { bg: '#E1F5EE', border: '#5DCAA5', nameColor: '#085041', dotColor: '#1D9E75', label: 'History' },
  INTENT:     { bg: '#FAECE7', border: '#F0997B', nameColor: '#712B13', dotColor: '#D85A30', label: 'Intent' },
  STRUCTURE:  { bg: '#E6F1FB', border: '#85B7EB', nameColor: '#0C447C', dotColor: '#378ADD', label: 'Structure' },
  RESONANCE:  { bg: '#FAEEDA', border: '#EF9F27', nameColor: '#633806', dotColor: '#BA7517', label: 'Resonance' },
};

const SKILLS: Skill[] = [
  // PERCEPTION
  {
    name: 'Color Tension', cat: 'PERCEPTION',
    desc: 'Do you feel the pull between colors? Warm-cool, light-dark, complementary — color acts directly on your nervous system before any thought.',
    example: 'A stroke of red beside a plaster white, or the subtle bleed at the edge of a Rothko block — ask yourself: does this make me want to move closer or pull away?',
  },
  {
    name: 'Compositional Pull', cat: 'PERCEPTION',
    desc: 'Where does your gaze go, and why? Artists use line, weight, and empty space to direct your eye — like a director controlling the camera.',
    example: 'Close your eyes, then open them. Where does your first glance land? That\'s where the artist wanted you to look. Then ask: why did they arrange it this way?',
  },
  {
    name: 'Materiality', cat: 'PERCEPTION',
    desc: 'What does the material make you sense? Weight, temperature, fragility, decay — physical properties act on the body before any interpretation.',
    example: 'Standing before a pile of discarded clothing, the density and texture you register are real information. That sensation is data.',
  },
  {
    name: 'Scale & Presence', cat: 'PERCEPTION',
    desc: 'How does the work\'s size affect your body? A monumental painting makes you feel small; a miniature demands you loom over it. Scale redefines the power relation between you and the work.',
    example: 'Standing before a painting three times your height versus peering at a matchbox-sized work with a magnifying glass are completely different bodily experiences.',
  },
  {
    name: 'Detail Hunter', cat: 'PERCEPTION',
    desc: 'Most people look and move on. Stay five more minutes — what do you find? Contemporary art often hides key information in corners, backs, and edges.',
    example: 'That stone installation: without looking closely you\'d never notice the small stone is suspended. Slow down. Walk around it.',
  },

  // HISTORY
  {
    name: 'Art Movement', cat: 'HISTORY',
    desc: 'Where does this work fit in the flow of art history? Every work responds to or rejects what came before — knowing the conversation sharpens what you see.',
    example: 'Minimalism, conceptual art, post-colonial practice — knowing the label isn\'t the goal; understanding who this work is in dialogue with is.',
  },
  {
    name: 'Lineage', cat: 'HISTORY',
    desc: 'Who is this work in dialogue with? Borrowing, homage, quotation, appropriation — what did the artist take from the past, and how did they make it their own?',
    example: 'Andy Warhol painting Campbell\'s soup cans — homage or critique of commercial culture? Looking backward illuminates what it\'s doing.',
  },
  {
    name: 'Historical Context', cat: 'HISTORY',
    desc: 'What moment was this work born into? A work from 2008 and one from 2020, even if formally similar, exist in completely different worlds.',
    example: 'A work made in 2018, the year cryptocurrency mining regulations tightened — that timing is rarely accidental.',
  },
  {
    name: 'Collection & Market', cat: 'HISTORY',
    desc: 'Who bought this work and why? Market prices and institutional collection reshape meaning — sometimes the opposite of what the artist intended.',
    example: 'A work critiquing capitalism bought by a billionaire to hang in their living room — that itself becomes part of the work\'s meaning.',
  },
  {
    name: 'Legacy', cat: 'HISTORY',
    desc: 'What did this work change? Did artists who came after make different choices because of it? Influence is a meaning that reveals itself with delay.',
    example: 'Some works were ignored when first shown, only rediscovered decades later as turning points. Indifference at the time doesn\'t mean no value.',
  },
  // INTENT
  {
    name: 'Life Traces', cat: 'INTENT',
    desc: 'What did the artist\'s personal experience leave in the work? Lived experience almost always seeps in, even when the work isn\'t autobiographical.',
    example: 'Louise Bourgeois spent a lifetime making giant spiders — they were her metaphor for her mother. Knowing that changes how you see them.',
  },
  {
    name: 'Argument', cat: 'INTENT',
    desc: 'What is this work saying to the world? An artist\'s position often hides in the choice of subject, materials, and how the work is shown rather than being stated directly.',
    example: 'Placing cryptocurrency and indigenous communities in the same frame is a position — even if the artist never explicitly stated one.',
  },
  {
    name: 'Obsession', cat: 'INTENT',
    desc: 'What drives the artist to return to this subject repeatedly? Obsession isn\'t a flaw — it\'s a clue pointing to a question the artist can\'t let go of.',
    example: 'Looking at an artist\'s entire body of work reveals more than any single piece. What keeps coming back is worth questioning.',
  },
  {
    name: 'Ambition', cat: 'INTENT',
    desc: 'What is the artist challenging in art itself? Form, medium, ways of seeing, or the very concept of what art is? This is the meta-level of the work.',
    example: 'Duchamp putting a urinal in a museum wasn\'t about the urinal — it was asking: who has the right to decide what is art?',
  },
  {
    name: 'The Specific', cat: 'INTENT',
    desc: 'Why this material, this place, this color, this size? Every specific choice has a reason — even if the artist says it was intuition, intuition comes from somewhere.',
    example: 'Why use discarded clothing instead of new garments? Real discards carry real consumption history — new clothes don\'t have that weight.',
  },
  // STRUCTURE
  {
    name: 'Hidden Mechanism', cat: 'STRUCTURE',
    desc: 'Does the work have an internal logic that\'s invisible until someone points it out? When you discover it, the entire meaning reorganizes.',
    example: 'A stone installation where a small rock is suspended — without looking closely you\'d never notice the balance. The hiding is what gives discovery its power.',
  },
  {
    name: 'Contradiction', cat: 'STRUCTURE',
    desc: 'Is there somewhere the work fights itself internally? Tension between form and content, material and subject — contradiction isn\'t a flaw, it\'s usually the core.',
    example: 'A work about fragility made of steel. A work about permanence made of ice. The contradiction itself carries the meaning.',
  },
  {
    name: 'Absence & Silence', cat: 'STRUCTURE',
    desc: 'What wasn\'t painted, wasn\'t said? Blank space, omission, and silence can be louder than what is present.',
    example: 'A portrait that only shows half a face — where is the other half? Who was excluded from this image? Those absent are often the most important.',
  },
  {
    name: 'Controlled Looking', cat: 'STRUCTURE',
    desc: 'Are you prescribed where and how to look? Some works have one correct angle; some require movement; some refuse to let you stand comfortably.',
    example: 'Roped-off zones, pedestals, lighting direction — all quietly telling you where you should stand and what posture you should take.',
  },
  {
    name: 'Temporality', cat: 'STRUCTURE',
    desc: 'How much time does this work ask of you? Will it change — decay, fade, disappear? Sometimes time itself is the material.',
    example: 'Ice sculptures melting during an exhibition, a performance that only happens once — the disappearance is part of the meaning.',
  },
  {
    name: 'Site', cat: 'STRUCTURE',
    desc: 'Where the work is placed is itself part of the meaning. Would it still work if removed from this space? Architecture, light, and history of the place all participate.',
    example: 'The same installation in a white-cube gallery and an abandoned factory are two different works. The space isn\'t background — it\'s content.',
  },
  // RESONANCE
  {
    name: 'Personal Memory', cat: 'RESONANCE',
    desc: 'What in your own life does this work evoke? Art\'s resonance isn\'t universal — the experiences you bring determine what you can see.',
    example: 'The same painting shows different things to someone who has lost someone and someone who hasn\'t. Your life is a tool for interpretation.',
  },
  {
    name: 'Gut Response', cat: 'RESONANCE',
    desc: 'Do you want to move closer or step back? Did your breathing change? Your body\'s response is more honest than your mind — it arrives before language.',
    example: 'Some people feel nauseous before certain installations; others feel their pulse quicken. This isn\'t subjective taste — it\'s data.',
  },
  {
    name: 'Ethical Discomfort', cat: 'RESONANCE',
    desc: 'Does something feel right or wrong here? Contemporary art often challenges moral boundaries — your discomfort is itself worth examining.',
    example: 'An installation made from animal carcasses repels you — is it because it causes harm, or because it makes you face something you usually choose not to see?',
  },
  {
    name: 'Wider Resonance', cat: 'RESONANCE',
    desc: 'What does this work make you think of outside art? A song, a conversation, a news story — meaning often explodes at the moment of crossing domains.',
    example: 'A work that makes you think of colonial history, data extraction, and tourism\'s consumption of culture — all are valid and connected readings.',
  },
  {
    name: 'Ineffable', cat: 'RESONANCE',
    desc: 'Some things you can\'t explain, but they left something in you. That inability to articulate is itself an interpretation — it doesn\'t need to be resolved.',
    example: 'Not all feelings need to become language. Sitting with confusion for a while — that too is a way of being with a work.',
  },
];

const CATEGORIES: SkillCategory[] = ['PERCEPTION', 'HISTORY', 'INTENT', 'STRUCTURE', 'RESONANCE'];

const ArtSkillsView: React.FC = () => {
  const [selected, setSelected] = useState<Skill | null>(null);

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '1.25rem 1.5rem 4rem', fontFamily: 'var(--font-family-serif)', background: '#faf9f7' }}>
      <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 960 }}>
        {CATEGORIES.map((cat, i) => {
          const cs = CAT_STYLE[cat];
          const catSkills = SKILLS.filter(s => s.cat === cat);
          return (
            <div
              key={cat}
              style={{
                display: 'flex', alignItems: 'stretch', gap: 10,
                borderTop: i > 0 ? '1px solid #e8e4df' : 'none',
                paddingTop: i > 0 ? '1.25rem' : 0,
                paddingBottom: '1.25rem',
              }}
            >
              {/* Category label column — fixed width so all skill columns align */}
              <div style={{ width: 120, flexShrink: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingRight: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#1a1714', textTransform: 'uppercase', lineHeight: 1.2 }}>{cat}</span>
              </div>

              {/* 5 skill cards — equal columns */}
              <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
                {catSkills.map(skill => (
                  <button
                    key={skill.name}
                    onClick={() => setSelected(skill)}
                    style={{
                      padding: '16px 10px 14px',
                      borderRadius: 10,
                      background: cs.bg,
                      border: `1px solid ${cs.border}`,
                      cursor: 'pointer',
                      fontFamily: 'var(--font-family-serif)',
                      fontSize: 12, fontWeight: 500, color: cs.nameColor,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
                      gap: 10, textAlign: 'center', lineHeight: 1.4,
                      transition: 'opacity 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')}
                    onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                  >
                    <span style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{skill.name}</span>
                    <span style={{ display: 'flex', gap: 3 }}>
                      {[0,1,2,3,4].map(j => (
                        <span
                          key={j}
                          style={{
                            display: 'inline-block', width: 6, height: 6,
                            borderRadius: 1,
                            transform: 'rotate(45deg)',
                            background: j < 2 ? cs.dotColor : 'transparent',
                            border: `1.5px solid ${j < 2 ? cs.dotColor : cs.border}`,
                          }}
                        />
                      ))}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Detail overlay */}
      {selected && (
        <div
          onClick={() => setSelected(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)',
            zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1.5rem',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 8, border: '0.5px solid rgba(26,23,20,0.12)',
              padding: '1.5rem', maxWidth: 380, width: '100%', position: 'relative',
              fontFamily: 'var(--font-family-serif)',
            }}
          >
            <button
              onClick={() => setSelected(null)}
              style={{ position: 'absolute', top: 12, right: 14, background: 'none', border: 'none', fontSize: 18, color: '#aaa', cursor: 'pointer', lineHeight: 1, padding: 0 }}
            >
              ×
            </button>

            {/* Category tag */}
            <div style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: '.08em', color: CAT_STYLE[selected.cat].dotColor, textTransform: 'uppercase', marginBottom: 6 }}>
              {selected.cat}
            </div>

            {/* Skill name */}
            <div style={{ fontSize: 18, fontWeight: 500, color: '#1a1714', marginBottom: '1rem' }}>
              {selected.name}
            </div>

            {/* Description */}
            <p style={{ fontSize: 14, color: '#555', lineHeight: 1.75, marginBottom: '1rem' }}>
              {selected.desc}
            </p>

            {/* Example */}
            <p style={{ fontSize: 13, color: '#888', borderLeft: `2px solid ${CAT_STYLE[selected.cat].border}`, paddingLeft: 10, lineHeight: 1.65, margin: 0 }}>
              {selected.example}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default ArtSkillsView;
