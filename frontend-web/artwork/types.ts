import type { GalleryItem } from '../types';

export type InterpretingItem = GalleryItem & {
  allVisitItems?: GalleryItem[];
  is_liked?: boolean;
};

export type IdentifyAgainValues = {
  artist: string;
  title: string;
  additionalClue: string;
};

export type IdentifyAgainHints = {
  artistName?: string;
  artworkName?: string;
  additionalClue?: string;
};
