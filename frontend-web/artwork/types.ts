import type { GalleryItem } from '../types';

export type ArtworkDetailSelection = {
  artworkId: string;
  navigationItemIds?: string[];
  is_liked?: boolean;
};

export type ArtworkNavigationItem = GalleryItem;

export type ArtworkDetailItem = GalleryItem & {
  navigationItems?: ArtworkNavigationItem[];
  is_liked?: boolean;
};

export type IdentifyAgainValues = {
  artist: string;
  title: string;
  additionalClue: string;
};

export type ArtworkMetadataEditValues = {
  artist: string;
  title: string;
  date: string;
  medium: string;
};

export type ArtworkSessionMembership = {
  sessionId: string;
  title: string;
};

export type IdentifyAgainHints = {
  artistName?: string;
  artworkName?: string;
  additionalClue?: string;
};
