import React, { useEffect, useState } from 'react';
import { ArtistEntity } from '../types';
import { fetchArtistProfile, backfillArtworkArtist } from '../apiService';

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

    async function load() {
      setIsLoading(true);
      try {
        let profile: ArtistEntity | null = null;
        if (artistEntityId) {
          profile = await fetchArtistProfile(artistEntityId);
        } else if (artworkId) {
          profile = await backfillArtworkArtist(artworkId);
        }
        if (!cancelled) setArtist(profile);
      } catch {
        // silently fail — sheet still shows with artist name
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
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
        background: 'rgba(0,0,0,0.5)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#1a1a1a', borderRadius: '16px 16px 0 0',
          padding: '24px 20px 40px', width: '100%', maxWidth: 520,
          maxHeight: '80vh', overflowY: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ width: 40, height: 4, background: '#555', borderRadius: 2, margin: '0 auto 20px' }} />

        {isLoading ? (
          <div style={{ color: '#888', textAlign: 'center', padding: '24px 0' }}>Loading…</div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{
                width: 48, height: 48, borderRadius: '50%',
                background: '#2a2a2a', display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#888', fontSize: 20, flexShrink: 0,
              }}>
                {(artist?.display_name || artistName || '?')[0]}
              </div>
              <div>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 18 }}>
                  {artist?.display_name || artistName || 'Unknown Artist'}
                </div>
                <div style={{ color: '#888', fontSize: 13, marginTop: 2 }}>
                  {[artist?.nationality, lifespan].filter(Boolean).join(' · ')}
                </div>
              </div>
            </div>

            {artist?.movements && artist.movements.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                {artist.movements.map(m => (
                  <span key={m} style={{
                    background: '#2a2a2a', color: '#aaa',
                    borderRadius: 12, padding: '3px 10px', fontSize: 12,
                  }}>{m}</span>
                ))}
              </div>
            )}

            {artist?.bio ? (
              <p style={{ color: '#ccc', fontSize: 14, lineHeight: 1.65, margin: 0 }}>
                {artist.bio}
              </p>
            ) : (
              <p style={{ color: '#555', fontSize: 14, margin: 0, fontStyle: 'italic' }}>
                Biography loading…
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
