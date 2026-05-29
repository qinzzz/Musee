import React from 'react';
import { createPortal } from 'react-dom';

interface Props {
  open: boolean;
  value: string;
  title?: string;
  heading?: string;
  description?: string;
  submitLabel?: string;
  inputLabel?: string;
  placeholder?: string;
  icon?: React.ReactNode;
  isSubmitting?: boolean;
  onValueChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

const CreateBoardModal: React.FC<Props> = ({
  open,
  value,
  title = 'New board',
  heading = 'Name your board',
  description = 'Create a board to group artworks into a collection you can return to later.',
  submitLabel = 'Create board',
  inputLabel = 'Board name',
  placeholder = 'Favorites from MoMA',
  icon,
  isSubmitting = false,
  onValueChange,
  onClose,
  onSubmit,
}) => {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const timeoutId = window.setTimeout(() => inputRef.current?.focus(), 10);
    return () => window.clearTimeout(timeoutId);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-neutral-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-[2rem] bg-white p-10 shadow-2xl">
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100">
          {icon ?? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#171717" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H10l2 2h5.5A2.5 2.5 0 0 1 20 9.5v8A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5z" />
            </svg>
          )}
        </div>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.3em] text-neutral-400">{title}</p>
        <h2 className="mb-3 text-xl font-serif text-neutral-900">{heading}</h2>
        <p className="mb-6 text-sm leading-relaxed text-neutral-500">{description}</p>
        <label className="block text-[10px] font-bold uppercase tracking-[0.3em] text-neutral-400">
          {inputLabel}
        </label>
        <input
          ref={inputRef}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onSubmit();
            }
          }}
          placeholder={placeholder}
          className="mt-3 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-[15px] text-neutral-900 outline-none transition-colors placeholder:text-neutral-300 focus:border-neutral-400"
        />

        <div className="mt-8 flex space-x-3">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 rounded-full px-6 py-3 text-[10px] font-bold uppercase tracking-[0.3em] text-neutral-500 transition-colors hover:bg-neutral-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={!value.trim() || isSubmitting}
            className="flex-1 rounded-full bg-neutral-900 px-6 py-3 text-[10px] font-bold uppercase tracking-[0.3em] text-white transition-colors hover:bg-black disabled:opacity-50"
          >
            {isSubmitting ? 'Saving…' : submitLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default CreateBoardModal;
