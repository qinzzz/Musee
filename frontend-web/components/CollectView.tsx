import React from 'react';
import type { SmartCollection } from '../api/artworks';
import type { Album, ArtworkClassification, GalleryItem, Visit } from '../types';
import type { ArtworkDetailContext, CollectTab } from '../lib/appNavigation';
import CanvasHeader from './CanvasHeader';
import InterpretationModal from './InterpretationModal';
import OrganizeView from './OrganizeView';

type InterpretationItem = GalleryItem & {
  allVisitItems?: GalleryItem[];
  is_liked?: boolean;
};

type CollectViewProps = {
  items: GalleryItem[];
  visit: Visit;
  filteredVisitId: string | null;
  isAnalyzing: boolean;
  likedIds: Set<string>;
  albums: Album[];
  boardsLoading: boolean;
  userId: string;
  collectTab: CollectTab;
  interpretingItem: InterpretationItem | null;
  artworkDetailContext: ArtworkDetailContext | null;
  artworkHeaderActions: React.ReactNode;
  artworkHeaderEditToken: number;
  interpretationRightMode: 'metadata' | 'community';
  interpretingMode: 'professional' | 'interactive';
  onCloseArtworkDetail: () => void;
  onUpdateMetadata: (itemId: string, fields: Partial<GalleryItem>) => void;
  onUpdateClassification: (itemId: string, classification: ArtworkClassification) => Promise<void>;
  onDeleteArtwork: (itemId: string) => void;
  onNavigateInterpretation: (direction: 'prev' | 'next') => void;
  onInterpretationRightModeChange: (mode: 'metadata' | 'community') => void;
  onSwitchInterpretingMode: () => void;
  onRefreshAnalysis: () => Promise<void>;
  onNavigateToArtistFromInterpretation: (
    artistEntityId: string,
    artworkId: string,
    artistName?: string,
  ) => void;
  onCollectTabChange: (tab: CollectTab) => void;
  onCreateBoard: (name: string, itemIds?: string[]) => Promise<Album>;
  onRenameBoard: (boardId: string, name: string) => Promise<Album>;
  onDeleteBoard: (boardId: string) => Promise<void>;
  onAddItemsToBoard: (boardId: string, itemIds: string[]) => Promise<void>;
  onOpenArtist: (artistEntityId: string, artistName: string) => void;
  onOpenMovement: (collection: SmartCollection) => void;
  onInterpretArtwork: (item: GalleryItem, context?: { items: GalleryItem[]; label: string }) => void;
  onDeleteItem: (id: string) => void;
  onStartUnsortedFlow: () => void;
};

export default function CollectView({
  items,
  visit,
  filteredVisitId,
  isAnalyzing,
  likedIds,
  albums,
  boardsLoading,
  userId,
  collectTab,
  interpretingItem,
  artworkDetailContext,
  artworkHeaderActions,
  artworkHeaderEditToken,
  interpretationRightMode,
  interpretingMode,
  onCloseArtworkDetail,
  onUpdateMetadata,
  onUpdateClassification,
  onDeleteArtwork,
  onNavigateInterpretation,
  onInterpretationRightModeChange,
  onSwitchInterpretingMode,
  onRefreshAnalysis,
  onNavigateToArtistFromInterpretation,
  onCollectTabChange,
  onCreateBoard,
  onRenameBoard,
  onDeleteBoard,
  onAddItemsToBoard,
  onOpenArtist,
  onOpenMovement,
  onInterpretArtwork,
  onDeleteItem,
  onStartUnsortedFlow,
}: CollectViewProps) {
  if (interpretingItem) {
    return (
      <div className="flex h-full min-w-0 flex-1 flex-col bg-[#f7f4ee]">
        <CanvasHeader
          parentLabel={artworkDetailContext?.parentLabel || 'All Artworks'}
          parentClick={onCloseArtworkDetail}
          childLabel={interpretingItem.artworkName || 'Untitled'}
          rightSlot={artworkHeaderActions}
          isInline={true}
        />
        <div className="flex-1 overflow-hidden animate-in fade-in zoom-in-98 duration-300">
          <InterpretationModal
            item={interpretingItem}
            onClose={onCloseArtworkDetail}
            onUpdateMetadata={onUpdateMetadata}
            onUpdateClassification={onUpdateClassification}
            onDelete={() => onDeleteArtwork(interpretingItem.id)}
            allVisitItems={interpretingItem.allVisitItems}
            onNavigate={onNavigateInterpretation}
            rightMode={interpretationRightMode}
            onRightModeChange={onInterpretationRightModeChange}
            interpretingMode={interpretingMode}
            onSwitchMode={onSwitchInterpretingMode}
            onRefreshAnalysis={onRefreshAnalysis}
            userId={userId}
            onNavigateToArtist={onNavigateToArtistFromInterpretation}
            navigationContextLabel={artworkDetailContext?.parentLabel || 'All Artworks'}
            editRequestToken={artworkHeaderEditToken}
            isInline={true}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-hidden pl-0 pt-16 md:pt-4">
      <OrganizeView
        items={items}
        visit={visit}
        filteredVisitId={filteredVisitId}
        isAnalyzing={isAnalyzing}
        likedIds={likedIds}
        albums={albums}
        boardsLoading={boardsLoading}
        userId={userId}
        collectTab={collectTab}
        onCollectTabChange={onCollectTabChange}
        onCreateBoard={onCreateBoard}
        onRenameBoard={onRenameBoard}
        onDeleteBoard={onDeleteBoard}
        onAddItemsToBoard={onAddItemsToBoard}
        onOpenArtist={onOpenArtist}
        onOpenMovement={onOpenMovement}
        onInterpret={onInterpretArtwork}
        onDelete={onDeleteItem}
        onStartUnsortedFlow={onStartUnsortedFlow}
      />
    </div>
  );
}
