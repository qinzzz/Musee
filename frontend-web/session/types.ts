import type { GalleryItem, Message } from '../types';

export type VisitStreamMessage = Message & {
  id: string;
  createdAt: number;
  type?: 'text' | 'artwork_capture' | 'artwork_card';
  artworkId?: string;
};

export type VisitDraft = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
};

export type VisitSummary = {
  id: string;
  title: string;
  titlePending?: boolean;
  location: string | null;
  artworkCount: number;
  updatedAt: number;
  dateLabel: string | null;
  items: GalleryItem[];
};

export type ActiveVisitStreamEntry =
  | {
      id: string;
      createdAt: number;
      type: 'artwork';
      item: GalleryItem;
    }
  | {
      id: string;
      createdAt: number;
      type: 'message';
      message: VisitStreamMessage;
    };

export type PendingSessionArtwork =
  | {
      id: string;
      kind: 'library';
      artwork: GalleryItem;
      previewUrl: string;
      label: string;
      sublabel: string;
    }
  | {
      id: string;
      kind: 'upload';
      file: File;
      previewUrl: string;
      mode: 'gallery' | 'camera';
      timestamp: number;
      photoTime: string;
      coords?: { latitude?: number; longitude?: number };
      location?: string;
      label: string;
      sublabel: string;
    };
