import React from 'react';
import type { ArtworkClassification, ArtworkWorkspace, GalleryItem } from '../../types';
import type { Board } from '../../boards/types';
import type { ArtworkDetailContext, CollectTab } from '../../lib/appNavigation';
import type { ArtworkDetailItem, IdentifyAgainHints } from '../../artwork/types';
import CanvasHeader from '../../components/CanvasHeader';
import ArtworkDetailModal from '../../artwork/components/ArtworkDetailModal';
import OrganizeView from './OrganizeView';

type CollectionViewProps = {
  headerLeftSlot?: React.ReactNode;
  topLevelLeftSlot?: React.ReactNode;
  onFileUpload: (event: React.ChangeEvent<HTMLInputElement>, mode: 'gallery' | 'camera') => void;
  artworksLoaded: boolean;
  items: GalleryItem[];
  artworkWorkspace: ArtworkWorkspace;
  filteredSessionId: string | null;
  isAnalyzing: boolean;
  likedIds: Set<string>;
  boards: Board[];
  boardsLoading: boolean;
  sessionTitleById: Record<string, string>;
  userId: string;
  collectTab: CollectTab;
  artworkDetailItem: ArtworkDetailItem | null;
  artworkDetailContext: ArtworkDetailContext | null;
  artworkHeaderActions: React.ReactNode;
  artworkHeaderEditToken: number;
  artworkDetailRightMode: 'metadata' | 'community';
  onCloseArtworkDetail: () => void;
  onUpdateMetadata: (itemId: string, fields: Partial<GalleryItem>) => void;
  onUpdateClassification: (itemId: string, classification: ArtworkClassification) => Promise<void>;
  onDeleteArtwork: (itemId: string) => void;
  onNavigateArtworkDetail: (direction: 'prev' | 'next') => void;
  onArtworkDetailRightModeChange: (mode: 'metadata' | 'community') => void;
  onIdentifyAgain: (hints?: IdentifyAgainHints) => Promise<void>;
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
  onInterpretArtwork: (item: GalleryItem, context?: { items: GalleryItem[]; label: string; basePath?: string }) => void;
  onDeleteItem: (id: string) => void;
  onDeleteItems: (itemIds: string[]) => void | Promise<void>;
  onStartUnsortedFlow: () => void;
};

export default function CollectionView({
  headerLeftSlot,
  topLevelLeftSlot,
  onFileUpload,
  artworksLoaded,
  items,
  artworkWorkspace,
  filteredSessionId,
  isAnalyzing,
  likedIds,
  boards,
  boardsLoading,
  sessionTitleById,
  userId,
  collectTab,
  artworkDetailItem,
  artworkDetailContext,
  artworkHeaderActions,
  artworkHeaderEditToken,
  artworkDetailRightMode,
  onCloseArtworkDetail,
  onUpdateMetadata,
  onUpdateClassification,
  onDeleteArtwork,
  onNavigateArtworkDetail,
  onArtworkDetailRightModeChange,
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
  onInterpretArtwork,
  onDeleteItem,
  onDeleteItems,
  onStartUnsortedFlow,
}: CollectionViewProps) {
  if (artworkDetailItem) {
    return (
      <div className="flex h-full min-w-0 flex-1 flex-col bg-[var(--color-bg-primary)]">
        <CanvasHeader
          parentLabel={artworkDetailContext?.parentLabel || 'All Artworks'}
          parentClick={onCloseArtworkDetail}
          childLabel={artworkDetailItem.artworkName || 'Untitled'}
          leftSlot={headerLeftSlot}
          rightSlot={artworkHeaderActions}
          isInline={true}
        />
        <div className="flex-1 overflow-hidden animate-in fade-in zoom-in-98 duration-300">
          <ArtworkDetailModal
            item={artworkDetailItem}
            onClose={onCloseArtworkDetail}
            onUpdateMetadata={onUpdateMetadata}
            onUpdateClassification={onUpdateClassification}
            onDelete={() => onDeleteArtwork(artworkDetailItem.id)}
            onNavigate={onNavigateArtworkDetail}
            rightMode={artworkDetailRightMode}
            onRightModeChange={onArtworkDetailRightModeChange}
            onIdentifyAgain={onIdentifyAgain}
            onRetryAnalysis={() => onRetryAnalysis(artworkDetailItem)}
            userId={userId}
            onNavigateToArtist={onNavigateToArtistFromInterpretation}
            onNavigateToSession={onNavigateToSessionFromInterpretation}
            sessionTitleById={sessionTitleById}
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
        artworksLoaded={artworksLoaded}
        items={items}
        artworkWorkspace={artworkWorkspace}
        filteredSessionId={filteredSessionId}
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
        onInterpret={onInterpretArtwork}
        onDelete={onDeleteItem}
        onDeleteArtworks={onDeleteItems}
        onStartUnsortedFlow={onStartUnsortedFlow}
      />
    </div>
  );
}
