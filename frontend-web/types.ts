
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

export interface Annotation {
  id: string;
  x: number; // 0-100 percentage
  y: number; // 0-100 percentage
  comment: string;
  author?: string;
}

export interface GalleryItem {
  id: string;
  url: string;
  keywords: string[];
  vibe: AestheticVibe;
  timestamp: number;
  conversation: Message[];
  annotations: Annotation[];
  visitId?: string;
  // Artwork analysis fields from backend
  artistName?: string;
  artworkName?: string;
  description?: string;
  artworkId?: string;  // Backend DB artwork ID for persistent conversations
}

export interface Visit {
  id: string;
  active: boolean;
  itemIds: string[];
  globalConversation: Message[];
}

export interface NeighborWork {
  id: string;
  url: string;
  annotations: Annotation[];
  conversation: Message[];
}

export interface NeighborItem {
  id: string;
  mainKeyword: string;
  works: NeighborWork[];
  resonances: number;
  coordinate: TagCoordinate; // New field for spatial mapping
}

export enum ViewMode {
  CORRIDOR = 'corridor',
  TOPOGRAPHY = 'topography'
}
