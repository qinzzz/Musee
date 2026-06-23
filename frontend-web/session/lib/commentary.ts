import type { GalleryItem } from '../../types';

export const isKnownArtistName = (artistName?: string | null) => {
  const normalized = artistName?.trim().toLowerCase();
  return Boolean(normalized && normalized !== 'unknown artist' && normalized !== 'unknown');
};

export const hasUsableArtworkTitle = (artworkName?: string | null) => {
  const normalized = artworkName?.trim().toLowerCase();
  return Boolean(normalized && normalized !== 'untitled' && normalized !== 'unknown artwork');
};

export const hasUsableCommentaryContext = (analysis: {
  artist_name?: string | null;
  artwork_name?: string | null;
  description?: string | null;
  tags?: string[] | null;
  date?: string | null;
  medium?: string | null;
}) => (
  isKnownArtistName(analysis.artist_name)
  || hasUsableArtworkTitle(analysis.artwork_name)
  || Boolean(analysis.description?.trim())
  || Boolean(analysis.tags?.length)
  || Boolean(analysis.date?.trim())
  || Boolean(analysis.medium?.trim())
);

export const describeArtworkForCommentary = (
  artwork: Partial<Pick<GalleryItem, 'artistName' | 'artworkName'>>,
) => {
  const hasKnownArtist = isKnownArtistName(artwork.artistName);
  const hasTitle = hasUsableArtworkTitle(artwork.artworkName);

  if (hasKnownArtist && hasTitle) {
    return `"${artwork.artworkName}" by ${artwork.artistName}`;
  }
  if (hasTitle) {
    return `"${artwork.artworkName}"`;
  }
  if (hasKnownArtist) {
    return `a work by ${artwork.artistName}`;
  }
  return 'an artwork whose artist is still unknown';
};

export function buildUploadCommentaryPrompt(
  artworks: Array<Partial<Pick<GalleryItem, 'artistName' | 'artworkName'>>>,
  sessionGoal?: string,
): string | null {
  if (artworks.length === 0) return null;

  if (artworks.length === 1) {
    const artwork = artworks[0];
    const goalClause = sessionGoal
      ? ` Connect your observation to the visitor's stated goal for this visit: "${sessionGoal}".`
      : ' Add a brief personal observation or connection to other works seen today.';

    if (isKnownArtistName(artwork.artistName)) {
      return `I just captured ${describeArtworkForCommentary(artwork)}. Write a short response (3–4 sentences): (1) introduce the artist and title naturally, (2) give a one-sentence interpretation of the work, (3)${goalClause} Warm, conversational tone — assume the user may not have opened the artwork card.`;
    }

    return `I just captured ${describeArtworkForCommentary(artwork)}. The attribution is still uncertain, so do not invent an artist. Write a short response (3–4 sentences): (1) briefly acknowledge that the artist is currently unknown or unconfirmed, (2) offer a grounded interpretation based on the work's visible qualities or available metadata, and (3)${goalClause} Warm, conversational tone — assume the user may not have opened the artwork card.`;
  }

  const list = artworks
    .map((artwork) => describeArtworkForCommentary(artwork))
    .join(', ');
  const goalClause = sessionGoal
    ? ` Tie it to the visitor's stated goal for this visit: "${sessionGoal}".`
    : '';
  const hasUnknownAttribution = artworks.some((artwork) => !isKnownArtistName(artwork.artistName));

  return `I just captured ${artworks.length} artworks at once: ${list}. Write ONE short, warm response (3–5 sentences) reacting to this group as a whole — point out a shared thread, an interesting contrast, or what they suggest together. Don't walk through them one by one or repeat the card details.${goalClause}${hasUnknownAttribution ? ' Some attributions may still be unknown, so acknowledge uncertainty where needed and do not invent artists.' : ''} Assume the user may not have opened the artwork cards.`;
}
