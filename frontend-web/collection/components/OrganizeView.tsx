import React, { useMemo, useRef, useState } from 'react';

import type { Board } from '../../boards/types';
import { buildArtistInvalidationKey, useUserArtists } from '../../artist/hooks/useUserArtists';
import type { CollectTab } from '../../lib/appNavigation';
import { SUPPORTED_UPLOAD_ACCEPT } from '../../lib/uploadValidation';
import type { ArtworkWorkspace, GalleryItem } from '../../types';
import ArtistsSection from './ArtistsSection';
import BoardsSection from './BoardsSection';
import CollectionChrome from './CollectionChrome';
import SavedArtworksSection from './SavedArtworksSection';
import { useArtworkSelection } from '../hooks/useArtworkSelection';
import { useBoardWorkflow } from '../hooks/useBoardWorkflow';
import { useCollectionViewModel } from '../hooks/useCollectionViewModel';
import type { ActiveFilter, SavedLayout } from '../types';

interface Props {
  topBarLeftSlot?: React.ReactNode;
  onFileUpload: (event: React.ChangeEvent<HTMLInputElement>, mode: 'gallery' | 'camera') => void;
  artworksLoaded: boolean;
  items: GalleryItem[];
  artworkWorkspace: ArtworkWorkspace;
  filteredSessionId: string | null;
  isAnalyzing: boolean;
  likedIds?: Set<string>;
  boards?: Board[];
  boardsLoading?: boolean;
  userId?: string | null;
  collectTab: CollectTab;
  onCollectTabChange: (tab: CollectTab) => void;
  onCreateBoard: (name: string, itemIds?: string[]) => Promise<Board>;
  onRenameBoard: (boardId: string, name: string) => Promise<Board>;
  onDeleteBoard: (boardId: string) => Promise<void>;
  onAddItemsToBoard: (boardId: string, itemIds: string[]) => Promise<void>;
  onOpenArtist: (artistEntityId: string, artistName: string) => void;
  onInterpret: (item: GalleryItem, context?: { items: GalleryItem[]; label: string }) => void;
  onDelete: (id: string) => void;
  onDeleteArtworks: (itemIds: string[]) => void | Promise<void>;
  onStartUnsortedFlow: () => void;
}

export default function OrganizeView({
  topBarLeftSlot,
  onFileUpload,
  artworksLoaded,
  items,
  artworkWorkspace,
  filteredSessionId,
  isAnalyzing,
  likedIds,
  boards,
  boardsLoading,
  userId,
  collectTab,
  onCollectTabChange,
  onCreateBoard,
  onRenameBoard,
  onDeleteBoard,
  onAddItemsToBoard,
  onOpenArtist,
  onInterpret,
  onDelete,
  onDeleteArtworks,
  onStartUnsortedFlow,
}: Props) {
  const [savedLayout, setSavedLayout] = useState<SavedLayout>('grid');
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('all');
  const [collectionSearch, setCollectionSearch] = useState('');

  const collectionUploadInputRef = useRef<HTMLInputElement>(null);
  const resolvedBoards = boards || [];
  const showCollectionUpload = true;
  const normalizedCollectionSearch = collectionSearch.trim().toLowerCase();

  const artistInvalidationKey = useMemo(() => buildArtistInvalidationKey(items), [items]);
  const { artists, isLoading: artistsLoading, error: artistsError } = useUserArtists({
    userId,
    invalidationKey: artistInvalidationKey,
    enabled: collectTab === 'artists',
  });

  const {
    selectedBoard,
    setSelectedBoard,
    newBoardName,
    setNewBoardName,
    isSubmittingBoard,
    createBoardRequest,
    renameBoardTarget,
    deleteBoardTarget,
    setDeleteBoardTarget,
    submitBoard,
    openCreateBoardModal,
    closeCreateBoardModal,
    submitRenameBoard,
    openRenameBoardModal,
    closeRenameBoardModal,
    handleDeleteBoard,
  } = useBoardWorkflow({
    onCreateBoard,
    onRenameBoard,
    onDeleteBoard,
  });

  const {
    likedItems,
    showFilterBar,
    searchedSavedItems,
    groupedItems,
    boardDetailItems,
    searchedBoardDetailItems,
    boardDetailName,
    unsortedCount,
    savedContextLabel,
    showSavedEmptyOverlay,
    showSavedLoadingSkeleton,
    searchedBoards,
    searchedArtists,
    collectionSearchPlaceholder,
    savedFilters,
  } = useCollectionViewModel({
    items,
    likedIds,
    boards: resolvedBoards,
    artists,
    collectTab,
    activeFilter,
    selectedBoard,
    normalizedCollectionSearch,
    artworksLoaded,
  });

  const {
    selectedArtworkIds,
    isArtworkSelectionMode,
    isApplyingBoard,
    isDeletingSelection,
    toggleArtworkSelection,
    enterArtworkSelectionMode,
    clearArtworkSelection,
    handleAddSelectionToBoard,
    handleDeleteSelection,
  } = useArtworkSelection({
    collectTab,
    savedLayout,
    searchedSavedItems,
    items,
    onAddItemsToBoard,
    onDeleteArtworks,
  });

  return (
    <div className="flex min-h-full w-full flex-col">
      <input
        ref={collectionUploadInputRef}
        type="file"
        accept={SUPPORTED_UPLOAD_ACCEPT}
        multiple
        className="hidden"
        onChange={(event) => onFileUpload(event, 'gallery')}
      />

      <div className="flex flex-col md:mx-auto md:w-full md:max-w-[1000px] md:px-8 md:pt-8 lg:pt-10">
        <CollectionChrome
          topBarLeftSlot={topBarLeftSlot}
          collectTab={collectTab}
          collectionSearch={collectionSearch}
          collectionSearchPlaceholder={collectionSearchPlaceholder}
          showCollectionUpload={showCollectionUpload}
          showArtworkSelection={collectTab === 'saved' && savedLayout === 'grid'}
          isArtworkSelectionMode={isArtworkSelectionMode}
          onCollectTabChange={(tab) => {
            onCollectTabChange(tab);
            setSelectedBoard(null);
          }}
          onCollectionSearchChange={setCollectionSearch}
          onOpenUpload={() => collectionUploadInputRef.current?.click()}
          onEnterArtworkSelectionMode={enterArtworkSelectionMode}
          onExitArtworkSelectionMode={clearArtworkSelection}
        />

        <div className="relative">
          {collectTab === 'saved' && (
            <SavedArtworksSection
              showFilterBar={showFilterBar}
              savedFilters={savedFilters}
              activeFilter={activeFilter}
              onActiveFilterChange={setActiveFilter}
              unsortedCount={unsortedCount}
              onStartUnsortedFlow={onStartUnsortedFlow}
              savedLayout={savedLayout}
              onSavedLayoutChange={setSavedLayout}
              showSavedLoadingSkeleton={showSavedLoadingSkeleton}
              searchedSavedItems={searchedSavedItems}
              artworkWorkspace={artworkWorkspace}
              filteredSessionId={filteredSessionId}
              isAnalyzing={isAnalyzing}
              boards={resolvedBoards}
              selectedArtworkIds={selectedArtworkIds}
              isArtworkSelectionMode={isArtworkSelectionMode}
              onToggleSelection={toggleArtworkSelection}
              onInterpret={onInterpret}
              onDelete={onDelete}
              savedContextLabel={savedContextLabel}
              groupedItems={groupedItems}
              artworksLoaded={artworksLoaded}
              showSavedEmptyOverlay={showSavedEmptyOverlay}
              normalizedCollectionSearch={normalizedCollectionSearch}
              onClearArtworkSelection={clearArtworkSelection}
              isApplyingBoard={isApplyingBoard}
              isDeletingSelection={isDeletingSelection}
              onAddSelectionToBoard={handleAddSelectionToBoard}
              onDeleteSelection={handleDeleteSelection}
              onOpenCreateBoardModal={openCreateBoardModal}
            />
          )}

          {collectTab === 'boards' && (
            <BoardsSection
              selectedBoard={selectedBoard}
              onSelectedBoardChange={setSelectedBoard}
              boardDetailName={boardDetailName}
              boardDetailItems={boardDetailItems}
              searchedBoardDetailItems={searchedBoardDetailItems}
              normalizedCollectionSearch={normalizedCollectionSearch}
              likedItems={likedItems}
              boards={searchedBoards}
              items={items}
              boardsLoading={Boolean(boardsLoading)}
              createBoardOpen={createBoardRequest !== null}
              newBoardName={newBoardName}
              isSubmittingBoard={isSubmittingBoard}
              renameBoardTarget={renameBoardTarget}
              deleteBoardTarget={deleteBoardTarget}
              onNewBoardNameChange={setNewBoardName}
              onOpenCreateBoardModal={openCreateBoardModal}
              onOpenRenameBoardModal={openRenameBoardModal}
              onDeleteBoardTargetChange={setDeleteBoardTarget}
              onCloseCreateBoardModal={closeCreateBoardModal}
              onSubmitBoard={submitBoard}
              onCloseRenameBoardModal={closeRenameBoardModal}
              onSubmitRenameBoard={submitRenameBoard}
              onConfirmDeleteBoard={handleDeleteBoard}
              onInterpret={(item, context) => onInterpret(item, context)}
            />
          )}

          {collectTab === 'artists' && (
            <ArtistsSection
              artistsLoading={artistsLoading}
              artistsError={artistsError}
              artists={searchedArtists}
              normalizedCollectionSearch={normalizedCollectionSearch}
              items={items}
              onOpenArtist={onOpenArtist}
            />
          )}
        </div>
      </div>
    </div>
  );
}
