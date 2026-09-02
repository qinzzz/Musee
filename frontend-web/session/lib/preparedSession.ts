import type { PendingSessionArtwork } from '../types';

export function buildPreparedSessionFallbackPrompt(
  entries: PendingSessionArtwork[],
): string {
  const libraryTitles = entries
    .filter((entry): entry is Extract<PendingSessionArtwork, { kind: 'library' }> => entry.kind === 'library')
    .map((entry) => `"${entry.artwork.artworkName || 'Untitled'}" by ${entry.artwork.artistName || 'Unknown Artist'}`);
  const uploadCount = entries.filter((entry) => entry.kind === 'upload').length;

  if (uploadCount > 0 && libraryTitles.length > 0) {
    return `I just started a session with ${uploadCount} new upload${uploadCount === 1 ? '' : 's'} and ${libraryTitles.length} saved artwork${libraryTitles.length === 1 ? '' : 's'} from my library (${libraryTitles.join(', ')}). Help me find the most interesting visual, thematic, or historical connections across them.`;
  }
  if (uploadCount > 0) {
    return `I just started a session with ${uploadCount} new upload${uploadCount === 1 ? '' : 's'}. Help me understand what stands out across these works and where I should look first.`;
  }
  return 'I just started a session with these saved artworks. Help me find the strongest thread that connects them and suggest a good first question to explore.';
}

// Fallback trigger when a staged batch is sent to an ONGOING session without
// a message: the companion reacts in the context of what the session already holds.
export function buildStagedSessionAdditionPrompt(
  entries: PendingSessionArtwork[],
): string {
  const libraryTitles = entries
    .filter((entry): entry is Extract<PendingSessionArtwork, { kind: 'library' }> => entry.kind === 'library')
    .map((entry) => `"${entry.artwork.artworkName || 'Untitled'}" by ${entry.artwork.artistName || 'Unknown Artist'}`);
  const uploadCount = entries.filter((entry) => entry.kind === 'upload').length;

  if (uploadCount > 0 && libraryTitles.length > 0) {
    return `I just added ${uploadCount} new upload${uploadCount === 1 ? '' : 's'} and ${libraryTitles.length} saved artwork${libraryTitles.length === 1 ? '' : 's'} from my collection (${libraryTitles.join(', ')}) to our session. In 3–4 sentences, react to the additions and how they connect to what we've been looking at.`;
  }
  if (uploadCount > 0) {
    return `I just added ${uploadCount} new upload${uploadCount === 1 ? '' : 's'} to our session. In 3–4 sentences, react to what I added and how it relates to what we've been looking at.`;
  }
  return `I just added ${libraryTitles.join(', ')} from my collection to our session. In 3–4 sentences, react to why these might belong here and how they connect to what we've been looking at.`;
}
