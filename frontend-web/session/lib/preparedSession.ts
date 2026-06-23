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
