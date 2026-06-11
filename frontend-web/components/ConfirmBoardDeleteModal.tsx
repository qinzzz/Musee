import React from 'react';
import { createPortal } from 'react-dom';
import { Album } from '../types';

interface Props {
  board: Album | null;
  isDeleting?: boolean;
  onClose: () => void;
  onConfirm: (board: Album) => void;
}

const ConfirmBoardDeleteModal: React.FC<Props> = ({
  board,
  isDeleting = false,
  onClose,
  onConfirm,
}) => {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!board) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isDeleting) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [board, isDeleting, onClose]);

  if (!mounted || !board) return null;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-neutral-900/60 backdrop-blur-sm" onClick={() => !isDeleting && onClose()} />
      <div className="relative w-full max-w-md rounded-[2rem] bg-white p-10 shadow-2xl">
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#171717" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </div>
        <h3 className="mb-3 text-xl font-serif text-neutral-900">Delete Board?</h3>
        <p className="mb-8 text-sm leading-relaxed text-neutral-500">
          This will remove <span className="font-medium text-neutral-700">{board.name}</span>, but not the artworks inside it.
        </p>
        <div className="flex space-x-3">
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="flex-1 rounded-full px-6 py-3 text-[12px] font-semibold text-neutral-500 transition-colors hover:bg-neutral-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(board)}
            disabled={isDeleting}
            className="flex-1 rounded-full bg-neutral-900 px-6 py-3 text-[12px] font-semibold text-white transition-colors hover:bg-black disabled:opacity-50"
          >
            {isDeleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ConfirmBoardDeleteModal;
