
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

export interface GalleryItem {
  id: string;
  url: string;
  keywords: string[];
  vibe: AestheticVibe;
  timestamp: number;
  conversation: Message[];
  visitId?: string;
  // Artwork analysis fields from backend
  artistName?: string;
  artworkName?: string;
  description?: string;
  artworkId?: string;  // Backend DB artwork ID for persistent conversations
  isAnalyzing?: boolean; // Loading state for batch analysis
  date?: string;
  medium?: string;
  streamingText?: string;
  location?: any;
  photoTime?: string;
  sessionTitle?: string;
  movement?: string;
  periodBucket?: string;
  referenceUrls?: ReferenceItem[];
  insights?: Array<{ title: string; text: string }>;
  artistEntityId?: string;
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
