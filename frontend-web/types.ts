
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

export interface ArtistEntity {
  id: string;
  display_name: string;
  bio?: string | null;
  nationality?: string | null;
  birth_year?: number | null;
  death_year?: number | null;
  movements?: string[];
  profile_image_url?: string | null;
  instance_count: number;
  bio_status: string;
}

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

export interface GalleryItem {
  id: string;
  url: string;
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
  isAnalyzing?: boolean; // Loading state for batch analysis
  date?: string;
  medium?: string;
  streamingText?: string;
  location?: any;
  photoTime?: string;
  movement?: string;
  periodBucket?: string;
  referenceUrls?: ReferenceItem[];
  insights?: Array<{ title: string; text: string }>;
  artistEntityId?: string;
  classification?: ArtworkClassification;
  analysisStatus?: ArtworkAnalysisStatus;
  analysisError?: string;
  deleteStatus?: ArtworkDeleteStatus;
  syncStatus?: 'pending' | 'synced' | 'failed';
  isDeletedPlaceholder?: boolean;
}

export interface Visit {
  id: string;
  itemIds: string[];
  globalConversation: Message[];
  title?: string;
  date?: string;
  updatedAt?: number;
}

export interface CuratorConversation {
  id: string;
  title: string;          // First user message, truncated to 60 chars
  messages: Message[];
  itemIds: string[];      // Artwork IDs in context when conversation started
  createdAt: number;
  updatedAt: number;
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

export interface Album {
  id: string;
  name: string;
  description?: string | null;
  itemIds: string[];
}

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
