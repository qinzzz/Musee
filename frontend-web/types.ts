
export interface ReferenceItem {
  page_url: string;
  thumbnail?: string;
  title?: string;
}

export interface AestheticVibe {
  backgroundColor: string;
  padding: number; // 0 to 10 scale
  borderRadius: string; // 'none', 'md', 'full'
  borderType: string; // 'solid', 'dashed', 'none'
  accentColor: string;
}

export interface Message {
  role: 'user' | 'model';
  text: string;
}

export interface TagCoordinate {
  x: number;
  y: number;
}

export type ArtistEntity = import('@musee/client-core').ArtistEntity;

export type ArtworkClassification = 'unsorted' | 'love' | 'respect' | 'not_for_me';
export type ArtworkAnalysisStatus = 'pending' | 'analyzing' | 'reidentifying' | 'failed' | 'analyzed';
export type ArtworkDeleteStatus = 'pending';

export interface SessionLink {
  id?: string;
  sessionId: string;
  sequenceNumber?: number;
  source?: 'library' | 'upload' | 'camera';
  createdAt?: string;
}

export interface ArtworkRecord {
  id: string;
  clientId?: string;
  url: string;
  thumbnailUrl?: string;
  keywords: string[];
  vibe: AestheticVibe;
  timestamp: number;
  sessionCapturedAt?: number;
  conversation: Message[];
  sessionLinks?: SessionLink[];
  // Artwork analysis fields from backend
  artistName?: string;
  artworkName?: string;
  description?: string;
  artworkId?: string;  // Backend DB artwork ID
  date?: string;
  medium?: string;
  location?: any;
  captureLocationOverride?: import('@musee/client-core').CaptureLocationOverride | null;
  photoTime?: string;
  captureMuseum?: {
    id: string;
    canonicalName: string;
  };
  movement?: string;
  periodBucket?: string;
  referenceUrls?: ReferenceItem[];
  insights?: Array<{ title: string; text: string }>;
  artistEntityId?: string;
  classification?: ArtworkClassification;
}

export interface ArtworkClientState {
  isAnalyzing?: boolean; // Loading state for batch analysis
  streamingText?: string;
  analysisStatus?: ArtworkAnalysisStatus;
  analysisError?: string;
  deleteStatus?: ArtworkDeleteStatus;
  syncStatus?: 'pending' | 'synced' | 'failed';
  isDeletedPlaceholder?: boolean;
}

export type GalleryItem = ArtworkRecord & ArtworkClientState;

export interface ArtworkWorkspace {
  id: string;
  itemIds: string[];
  globalConversation: Message[];
  title?: string;
  date?: string;
  updatedAt?: number;
}

export interface NeighborWork {
  id: string;
  url: string;
  conversation: Message[];
}

export interface NeighborItem {
  id: string;
  mainKeyword: string;
  works: NeighborWork[];
  resonances: number;
  coordinate: TagCoordinate; // New field for spatial mapping
}

export type Album = import('@musee/client-core').Board;

export interface TasteProfileSnapshot {
  status: string;
  eligible_count: number;
  required_count: number;
  unsorted_count: number;
  is_generated: boolean;
  is_outdated: boolean;
  can_generate: boolean;
  generated_at?: string | null;
  love_count: number;
  reject_count: number;
  respect_count: number;
  love_vector?: Record<string, number>;
  reject_vector?: Record<string, number>;
  taste_vector?: Record<string, number>;
  narrative_summary?: string | null;
  dimension_examples?: Record<string, {
    dominant_pole: string;
    other_pole: string;
    examples: Array<{
      artwork_id: string;
      photo_url: string | null;
      artist_name: string;
      artwork_name: string;
      dim_score: number;
      classification?: ArtworkClassification;
    }>;
  }>;
}

export enum ViewMode {
  GALLERY = 'gallery',
  TOPOGRAPHY = 'topography',
  GRID = 'grid',
  ALBUM = 'album'
}

export type AnalysisMode = 'professional' | 'interactive';
export type SkillCategory = 'PERCEPTION' | 'HISTORY' | 'INTENT' | 'STRUCTURE' | 'RESONANCE';

export interface ArtworkSkill {
  id: number;
  name: string;
  desc: string;
  cat: SkillCategory;
  observations: string[];
  more: { text: string; question: string; label: string } | null;
}
