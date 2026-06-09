import React, { useEffect, useState } from 'react';
import { ArtistEntity } from '../types';
import { fetchArtistProfile, backfillArtworkArtist } from '../api/artworks';

interface Props {
  artistEntityId?: string;
  artworkId?: string;
  artistName?: string;
  onClose: () => void;
}

export default function ArtistProfileSheet({ artistEntityId, artworkId, artistName, onClose }: Props) {
  const [artist, setArtist] = useState<ArtistEntity | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    async function load() {
      setIsLoading(true);
      try {
        let profile: ArtistEntity | null = null;
        if (artistEntityId) {
          profile = await fetchArtistProfile(artistEntityId);
        } else if (artworkId) {
          profile = await backfillArtworkArtist(artworkId);
        }
        if (!cancelled) {
          setArtist(profile);
          // Poll if bio is still being computed (new-upload background case)
          if (profile && profile.id && profile.bio_status === 'processing') {
            let attempts = 0;
            const poll = async () => {
              if (cancelled || attempts >= 12) return;
              attempts++;
              try {
                const updated = await fetchArtistProfile(profile!.id);
                if (!cancelled && updated) {
                  setArtist(updated);
                  if (updated.bio_status === 'processing') {
                    pollTimer = setTimeout(poll, 2500);
                  }
                }
              } catch { /* ignore */ }
            };
            pollTimer = setTimeout(poll, 2500);
          }
        }
      } catch {
        // silently fail — sheet still shows with artist name
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [artistEntityId, artworkId]);

  const lifespan = (() => {
    if (!artist) return null;
    const { birth_year, death_year } = artist;
    if (birth_year && death_year) return `${birth_year}–${death_year}`;
    if (birth_year) return `b. ${birth_year}`;
    return null;
  })();

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1100,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        background: 'rgba(23,23,23,0.3)',
        backdropFilter: 'blur(2px)',
        WebkitBackdropFilter: 'blur(2px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--color-bg-primary)', borderRadius: '24px 24px 0 0',
          padding: '24px 20px 40px', width: '100%', maxWidth: 520,
          maxHeight: '80vh', overflowY: 'auto',
          boxShadow: '0 -10px 40px rgba(0,0,0,0.06)',
          border: '1px solid rgba(23,23,23,0.05)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ width: 40, height: 4, background: 'var(--color-border)', borderRadius: 2, margin: '0 auto 20px' }} />

        {isLoading ? (
          <div style={{ color: '#737373', textAlign: 'center', padding: '24px 0', fontSize: 13, fontStyle: 'italic' }}>Loading…</div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{
                width: 48, height: 48, borderRadius: '50%',
                background: 'var(--color-surface-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#737373', fontSize: 20, flexShrink: 0,
                fontWeight: 600,
              }}>
                {(artist?.display_name || artistName || '?')[0]}
              </div>
              <div>
                <div style={{ color: '#171717', fontWeight: 700, fontSize: 18 }}>
                  {artist?.display_name || artistName || 'Unknown Artist'}
                </div>
                <div style={{ color: '#737373', fontSize: 13, marginTop: 2 }}>
                  {[artist?.nationality, lifespan].filter(Boolean).join(' · ')}
                </div>
              </div>
            </div>

            {artist?.movements && artist.movements.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                {artist.movements.map(m => (
                  <span key={m} style={{
                    background: 'var(--color-bg-tertiary)', color: '#525252',
                    borderRadius: 12, padding: '3px 10px', fontSize: 11,
                    fontWeight: 500, border: '1px solid rgba(23,23,23,0.03)',
                  }}>{m}</span>
                ))}
              </div>
            )}

            {artist?.bio ? (
              <p style={{ color: '#404040', fontSize: 14, lineHeight: 1.65, margin: 0 }}>
                {artist.bio}
              </p>
            ) : artist?.bio_status === 'processing' ? (
              <p style={{ color: '#a3a3a3', fontSize: 14, margin: 0, fontStyle: 'italic' }}>
                Biography loading…
              </p>
            ) : (
              <p style={{ color: '#a3a3a3', fontSize: 14, margin: 0, fontStyle: 'italic' }}>
                No biography available.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
