import type React from 'react';

import CreateBoardModal from '../../components/CreateBoardModal';
import ConfirmBoardDeleteModal from '../../components/ConfirmBoardDeleteModal';
import CollectionGridSkeleton from '../../components/CollectionGridSkeleton';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../components/ui/dropdown-menu';
import type { Board } from '../../boards/types';
import type { GalleryItem } from '../../types';
import { getBoardArtworkCount, getBoardCoverImages } from '../lib/organizeView';

const OverflowDotsIcon: React.FC<{ className?: string }> = ({ className = 'h-3.5 w-3.5' }) => (
  <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden="true">
    <circle cx="3" cy="8" r="1.25" />
    <circle cx="8" cy="8" r="1.25" />
    <circle cx="13" cy="8" r="1.25" />
  </svg>
);

const BoardCoverMosaic: React.FC<{ covers: string[] }> = ({ covers }) => {
  const slots = [covers[0] ?? null, covers[1] ?? null, covers[2] ?? null] as const;

  return (
    <div className="mb-2.5 grid aspect-square grid-cols-[1.35fr_1fr] grid-rows-2 gap-0.5 overflow-hidden rounded-xl bg-[var(--color-border)]">
      {slots.map((cover, index) => {
        const slotClassName = index === 0 ? 'row-span-2 h-full' : 'h-full';

        return cover ? (
          <img key={index} src={cover} alt="" className={`${slotClassName} w-full object-cover`} />
        ) : (
          <div key={index} className={`${slotClassName} bg-[var(--color-bg-tertiary)]`} aria-hidden="true" />
        );
      })}
    </div>
  );
};

type Props = {
  selectedBoard: 'liked' | string | null;
  onSelectedBoardChange: (boardId: 'liked' | string | null) => void;
  boardDetailName: string;
  boardDetailItems: GalleryItem[];
  searchedBoardDetailItems: GalleryItem[];
  normalizedCollectionSearch: string;
  likedItems: GalleryItem[];
  boards: Board[];
  items: GalleryItem[];
  boardsLoading: boolean;
  createBoardOpen: boolean;
  newBoardName: string;
  isSubmittingBoard: boolean;
  renameBoardTarget: Board | null;
  deleteBoardTarget: Board | null;
  onNewBoardNameChange: (value: string) => void;
  onOpenCreateBoardModal: (options?: { itemIds?: string[]; onCreated?: (board: Board) => void }) => void;
  onOpenRenameBoardModal: (board: Board) => void;
  onDeleteBoardTargetChange: (board: Board | null) => void;
  onCloseCreateBoardModal: () => void;
  onSubmitBoard: () => Promise<void> | void;
  onCloseRenameBoardModal: () => void;
  onSubmitRenameBoard: () => Promise<void> | void;
  onConfirmDeleteBoard: (board: Board) => Promise<void> | void;
  onInterpret: (item: GalleryItem, context: { items: GalleryItem[]; label: string }) => void;
};

export default function BoardsSection({
  selectedBoard,
  onSelectedBoardChange,
  boardDetailName,
  boardDetailItems,
  searchedBoardDetailItems,
  normalizedCollectionSearch,
  likedItems,
  boards,
  items,
  boardsLoading,
  createBoardOpen,
  newBoardName,
  isSubmittingBoard,
  renameBoardTarget,
  deleteBoardTarget,
  onNewBoardNameChange,
  onOpenCreateBoardModal,
  onOpenRenameBoardModal,
  onDeleteBoardTargetChange,
  onCloseCreateBoardModal,
  onSubmitBoard,
  onCloseRenameBoardModal,
  onSubmitRenameBoard,
  onConfirmDeleteBoard,
  onInterpret,
}: Props) {
  const boardOverflowButtonClassName =
    'flex h-7 w-7 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-400 transition-colors hover:border-neutral-300 hover:text-neutral-700';

  return (
    <div>
      {selectedBoard === null ? (
        <div className="px-4 pt-5 pb-32 sm:px-8 md:px-0">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium text-neutral-400">Boards</p>
              <p className="mt-1 text-[12px] text-neutral-500">Curate your own collections of artworks.</p>
            </div>
            <button
              onClick={() =>
                onOpenCreateBoardModal({
                  onCreated: (createdBoard) => onSelectedBoardChange(createdBoard.id),
                })
              }
              className="shrink-0 rounded-full border border-neutral-200 px-4 py-2 text-[12px] font-medium text-neutral-700 transition-colors hover:border-neutral-400"
            >
              New board
            </button>
          </div>

          {boardsLoading ? (
            <CollectionGridSkeleton />
          ) : likedItems.length === 0 && boards.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center gap-2">
              <p className="text-[12px] text-neutral-300">No boards yet</p>
              <p className="text-[11px] text-neutral-400">Create a board to start curating your collection.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 md:grid-cols-4">
              {likedItems.length > 0 && (
                <button onClick={() => onSelectedBoardChange('liked')} className="group text-left">
                  <BoardCoverMosaic covers={likedItems.slice(0, 3).map((item) => item.url)} />
                  <p className="truncate text-[12px] font-semibold leading-tight text-neutral-900">Liked</p>
                  <p className="mt-0.5 text-[11px] text-neutral-400">
                    {likedItems.length} {likedItems.length === 1 ? 'artwork' : 'artworks'}
                  </p>
                </button>
              )}
              {boards.map((board) => {
                const covers = getBoardCoverImages(board.itemIds, items);
                const count = getBoardArtworkCount(board.itemIds, items);
                return (
                  <div key={board.id} className="group text-left">
                    <button type="button" onClick={() => onSelectedBoardChange(board.id)} className="block w-full">
                      <BoardCoverMosaic covers={covers.slice(0, 3)} />
                    </button>
                    <div className="flex items-start justify-between gap-2">
                      <button type="button" onClick={() => onSelectedBoardChange(board.id)} className="min-w-0 flex-1 text-left">
                        <p className="truncate text-[12px] font-semibold leading-tight text-neutral-900">{board.name}</p>
                        <p className="mt-0.5 text-[11px] text-neutral-400">
                          {count} {count === 1 ? 'artwork' : 'artworks'}
                        </p>
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button type="button" className={boardOverflowButtonClassName} aria-label={`${board.name} board actions`}>
                            <OverflowDotsIcon />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-[180px]">
                          <DropdownMenuItem
                            onSelect={(event) => {
                              event.preventDefault();
                              onOpenRenameBoardModal(board);
                            }}
                          >
                            Rename board
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            destructive
                            onSelect={(event) => {
                              event.preventDefault();
                              onDeleteBoardTargetChange(board);
                            }}
                          >
                            Delete board
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col">
          <div className="shrink-0 border-b border-neutral-100 px-4 pt-4 pb-3 sm:px-8 md:px-0">
            <div className="flex items-center gap-3">
              <button
                onClick={() => onSelectedBoardChange(null)}
                className="flex items-center gap-1.5 text-neutral-400 transition-colors hover:text-neutral-900"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
                <span className="text-[11px] font-medium">Boards</span>
              </button>
              <span className="text-xs text-neutral-200">/</span>
              <span className="text-[12px] font-semibold text-neutral-900">{boardDetailName}</span>
              <span className="ml-auto text-[10px] text-neutral-400">
                {boardDetailItems.length} {boardDetailItems.length === 1 ? 'artwork' : 'artworks'}
              </span>
            </div>
          </div>
          <div className="min-h-0 flex-1">
            {searchedBoardDetailItems.length === 0 ? (
              <div className="flex h-32 items-center justify-center">
                <p className="text-[12px] text-neutral-300">{normalizedCollectionSearch ? 'No matching artworks' : 'Empty board'}</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2 px-4 pt-4 pb-32 sm:grid-cols-4 sm:gap-3 sm:px-8 md:grid-cols-5 md:px-0">
                {searchedBoardDetailItems.map((item) => (
                  <div
                    key={item.id}
                    className={`aspect-square overflow-hidden rounded bg-neutral-100 transition-opacity ${
                      item.deleteStatus === 'pending' ? 'cursor-default opacity-45' : 'cursor-pointer hover:opacity-90'
                    }`}
                    onClick={() => {
                      if (item.deleteStatus === 'pending') return;
                      onInterpret(item, { items: searchedBoardDetailItems, label: boardDetailName });
                    }}
                  >
                    <img
                      src={item.url}
                      alt=""
                      className={`h-full w-full object-cover ${item.deleteStatus === 'pending' ? 'saturate-[0.7]' : ''}`}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <CreateBoardModal
        open={createBoardOpen}
        value={newBoardName}
        title="New board"
        heading="Name your board"
        description="Create a board to group artworks into a collection you can return to later."
        submitLabel="Create board"
        isSubmitting={isSubmittingBoard}
        onValueChange={onNewBoardNameChange}
        onClose={onCloseCreateBoardModal}
        onSubmit={onSubmitBoard}
      />

      <CreateBoardModal
        open={renameBoardTarget !== null}
        value={newBoardName}
        title="Rename board"
        heading="Update board name"
        description="Give this board a clearer name without changing the artworks inside it."
        submitLabel="Save name"
        isSubmitting={isSubmittingBoard}
        onValueChange={onNewBoardNameChange}
        onClose={onCloseRenameBoardModal}
        onSubmit={onSubmitRenameBoard}
      />

      <ConfirmBoardDeleteModal
        board={deleteBoardTarget}
        isDeleting={isSubmittingBoard}
        onClose={() => {
          if (!isSubmittingBoard) onDeleteBoardTargetChange(null);
        }}
        onConfirm={(board) => {
          void onConfirmDeleteBoard(board);
        }}
      />
    </div>
  );
}
