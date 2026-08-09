import type { GalleryItem, Message } from '../types';

export type SessionStreamMessage = Message & {
  id: string;
  createdAt: number;
  // Client-side creation order, used to order optimistic events that don't yet
  // have a sequence_number. Ordering never uses createdAt — see sessionOrdering.
  localOrder?: number;
  type?: 'text' | 'artwork_capture' | 'artwork_card' | 'artwork_commentary' | 'model_response';
  artworkId?: string;
  artworkIds?: string[];
  payload?: Record<string, unknown>;
  // Local UI anchor used to group related session entries. In persisted data
  // this should usually resolve to the originating user_input event id.
  triggerEventId?: string;
  // Server-assigned total ordering; used as a deterministic tiebreaker.
  sequenceNumber?: number;
};

export type SessionDraft = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
};

export type SessionSummary = {
  id: string;
  title: string;
  titlePending?: boolean;
  location: string | null;
  artworkCount: number;
  updatedAt: number;
  dateLabel: string | null;
  items: GalleryItem[];
};

export type ActiveSessionStreamEntry =
  | {
      id: string;
      createdAt: number;
      type: 'artwork';
      item: GalleryItem;
      triggerEventId?: string;
      sequenceNumber?: number;
    }
  | {
      id: string;
      createdAt: number;
      type: 'message';
      message: SessionStreamMessage;
      triggerEventId?: string;
      sequenceNumber?: number;
    };

export type SessionRenderBlock =
  | {
      type: 'input';
      id: string;
      createdAt: number;
      sequenceNumber?: number;
      localOrder?: number;
      items: GalleryItem[];
      sourceLabel: string;
      userMessage?: SessionStreamMessage;
    }
  | {
      type: 'artwork_group';
      id: string;
      createdAt: number;
      items: GalleryItem[];
      sourceLabel: string;
    }
  | {
      type: 'commentary';
      id: string;
      createdAt: number;
      sequenceNumber?: number;
      localOrder?: number;
      message: SessionStreamMessage;
      status: 'pending' | 'completed' | 'failed';
    }
  | {
      type: 'message';
      id: string;
      createdAt: number;
      sequenceNumber?: number;
      localOrder?: number;
      message: SessionStreamMessage;
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
      labelFile?: File | null;
      timestamp: number;
      photoTime: string;
      coords?: { latitude?: number; longitude?: number };
      location?: string;
      label: string;
      sublabel: string;
    };
