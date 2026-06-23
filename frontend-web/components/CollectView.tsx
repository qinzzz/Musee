import React from 'react';
import type { SmartCollection } from '../api/artworks';
import type { ArtworkClassification, GalleryItem, Visit } from '../types';
import type { Board } from '../boards/types';
import type { ArtworkDetailContext, CollectTab } from '../lib/appNavigation';
import CanvasHeader from './CanvasHeader';
import InterpretationModal from './InterpretationModal';
import OrganizeView from './OrganizeView';

type InterpretationItem = GalleryItem & {
  allVisitItems?: GalleryItem[];
  is_liked?: boolean;
};

type CollectViewProps = {
  headerLeftSlot?: React.ReactNode;
  topLevelLeftSlot?: React.ReactNode;
  onFileUpload: (event: React.ChangeEvent<HTMLInputElement>, mode: 'gallery' | 'camera') => void;
  items: GalleryItem[];
  visit: Visit;
  filteredVisitId: string | null;
  isAnalyzing: boolean;
  likedIds: Set<string>;
  boards: Board[];
  boardsLoading: boolean;
  userId: string;
  collectTab: CollectTab;
  interpretingItem: InterpretationItem | null;
  artworkDetailContext: ArtworkDetailContext | null;
  artworkHeaderActions: React.ReactNode;
  artworkHeaderEditToken: number;
  interpretationRightMode: 'metadata' | 'community';
  onCloseArtworkDetail: () => void;
  onUpdateMetadata: (itemId: string, fields: Partial<GalleryItem>) => void;
  onUpdateClassification: (itemId: string, classification: ArtworkClassification) => Promise<void>;
  onDeleteArtwork: (itemId: string) => void;
  onNavigateInterpretation: (direction: 'prev' | 'next') => void;
  onInterpretationRightModeChange: (mode: 'metadata' | 'community') => void;
  onIdentifyAgain: (hints?: { artistName?: string; artworkName?: string; additionalClue?: string }) => Promise<void>;
  onRetryAnalysis: (item: GalleryItem) => Promise<void>;
  onNavigateToArtistFromInterpretation: (
    artistEntityId: string,
    artworkId: string,
    artistName?: string,
  ) => void;
  onNavigateToSessionFromInterpretation: (sessionId: string) => void;
  onCollectTabChange: (tab: CollectTab) => void;
  onCreateBoard: (name: string, itemIds?: string[]) => Promise<Board>;
  onRenameBoard: (boardId: string, name: string) => Promise<Board>;
  onDeleteBoard: (boardId: string) => Promise<void>;
  onAddItemsToBoard: (boardId: string, itemIds: string[]) => Promise<void>;
  onOpenArtist: (artistEntityId: string, artistName: string) => void;
  onOpenMovement: (collection: SmartCollection) => void;
  onInterpretArtwork: (item: GalleryItem, context?: { items: GalleryItem[]; label: string }) => void;
  onDeleteItem: (id: string) => void;
  onStartUnsortedFlow: () => void;
};

export default function CollectView({
  headerLeftSlot,
  topLevelLeftSlot,
  onFileUpload,
  items,
  visit,
  filteredVisitId,
  isAnalyzing,
  likedIds,
  boards,
  boardsLoading,
  userId,
  collectTab,
  interpretingItem,
  artworkDetailContext,
  artworkHeaderActions,
  artworkHeaderEditToken,
  interpretationRightMode,
  onCloseArtworkDetail,
  onUpdateMetadata,
  onUpdateClassification,
  onDeleteArtwork,
  onNavigateInterpretation,
  onInterpretationRightModeChange,
  onIdentifyAgain,
  onRetryAnalysis,
  onNavigateToArtistFromInterpretation,
  onNavigateToSessionFromInterpretation,
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
      <div className="flex h-full min-w-0 flex-1 flex-col bg-[var(--color-bg-primary)]">
        <CanvasHeader
          parentLabel={artworkDetailContext?.parentLabel || 'All Artworks'}
          parentClick={onCloseArtworkDetail}
          childLabel={interpretingItem.artworkName || 'Untitled'}
          leftSlot={headerLeftSlot}
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
            onIdentifyAgain={onIdentifyAgain}
            onRetryAnalysis={() => onRetryAnalysis(interpretingItem)}
            userId={userId}
            onNavigateToArtist={onNavigateToArtistFromInterpretation}
            onNavigateToSession={onNavigateToSessionFromInterpretation}
            navigationContextLabel={artworkDetailContext?.parentLabel || 'All Artworks'}
            editRequestToken={artworkHeaderEditToken}
            isInline={true}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex-1 overflow-y-auto pl-0 pt-0">
      <OrganizeView
        topBarLeftSlot={topLevelLeftSlot}
        onFileUpload={onFileUpload}
        items={items}
        visit={visit}
        filteredVisitId={filteredVisitId}
        isAnalyzing={isAnalyzing}
        likedIds={likedIds}
        boards={boards}
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
