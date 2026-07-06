import React from 'react';
import type { SessionSummary } from '../../session/types';

export type DeleteConfirmationState = {
  id: string;
  type: 'item' | 'session';
} | null;

type Props = {
  deleteConfirmation: DeleteConfirmationState;
  pendingDeleteSessionSummary: SessionSummary | null;
  showCaptureExitModal: boolean;
  onCloseDeleteConfirmation: () => void;
  onConfirmDeleteItem: (id: string) => void;
  onConfirmDeleteSession: (id: string) => void;
  onCancelCaptureExit: () => void;
  onConfirmCaptureExit: () => void;
};

export default function AppConfirmationLayer({
  deleteConfirmation,
  pendingDeleteSessionSummary,
  showCaptureExitModal,
  onCloseDeleteConfirmation,
  onConfirmDeleteItem,
  onConfirmDeleteSession,
  onCancelCaptureExit,
  onConfirmCaptureExit,
}: Props) {
  return (
    <>
      {deleteConfirmation && (
        <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-6">
          <div
            className="absolute inset-0 bg-neutral-900/60 backdrop-blur-sm"
            onClick={onCloseDeleteConfirmation}
          />
          <div className="relative w-full max-w-md rounded-[2rem] bg-white p-10 shadow-2xl">
            <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#171717" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </div>
            <h3 className="mb-3 text-xl font-serif text-neutral-900">
              {deleteConfirmation.type === 'item' ? 'Remove Artwork?' : 'Delete Session?'}
            </h3>
            <p className="mb-8 text-sm leading-relaxed text-neutral-500">
              {deleteConfirmation.type === 'item'
                ? 'This will permanently remove this artwork and its curated analysis from your Musee.'
                : `This will permanently delete ${pendingDeleteSessionSummary?.title || 'this session'} and its reflections from Musee. The ${pendingDeleteSessionSummary?.artworkCount || 0} ${pendingDeleteSessionSummary?.artworkCount === 1 ? 'artwork will stay' : 'artworks will stay'} in your library.`}
            </p>
            <div className="flex space-x-3">
              <button
                onClick={onCloseDeleteConfirmation}
                className="flex-1 rounded-full px-6 py-3 text-[12px] font-semibold text-neutral-500 transition-colors hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (deleteConfirmation.type === 'item') {
                    onConfirmDeleteItem(deleteConfirmation.id);
                    return;
                  }
                  onConfirmDeleteSession(deleteConfirmation.id);
                }}
                className="flex-1 rounded-full bg-neutral-900 px-6 py-3 text-[12px] font-semibold text-white transition-colors hover:bg-black"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {showCaptureExitModal && (
        <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-6">
          <div
            className="absolute inset-0 bg-neutral-900/60 backdrop-blur-sm"
            onClick={onCancelCaptureExit}
          />
          <div className="relative w-full max-w-md rounded-[2rem] bg-white p-10 shadow-2xl">
            <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#171717" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 9v4" />
                <path d="M12 17h.01" />
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
              </svg>
            </div>
            <h3 className="mb-3 text-xl font-serif text-neutral-900">
              Discard captures?
            </h3>
            <p className="mb-8 text-sm leading-relaxed text-neutral-500">
              Your captured artwork and label will be removed if you leave this screen now.
            </p>
            <div className="flex space-x-3">
              <button
                onClick={onConfirmCaptureExit}
                className="flex-1 rounded-full px-6 py-3 text-[12px] font-semibold text-neutral-500 transition-colors hover:bg-neutral-50"
              >
                Leave
              </button>
              <button
                onClick={onCancelCaptureExit}
                className="flex-1 rounded-full bg-neutral-900 px-6 py-3 text-[12px] font-semibold text-white transition-colors hover:bg-black"
              >
                Stay
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
