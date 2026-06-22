import React from 'react';
import { createPortal } from 'react-dom';

export type IdentifyAgainValues = {
  artist: string;
  title: string;
  additionalClue: string;
};

type Props = {
  open: boolean;
  values: IdentifyAgainValues;
  error?: string | null;
  isSubmitting?: boolean;
  onValuesChange: (values: IdentifyAgainValues) => void;
  onClose: () => void;
  onSubmit: () => void;
};

const IdentifyAgainModal: React.FC<Props> = ({
  open,
  values,
  error = null,
  isSubmitting = false,
  onValuesChange,
  onClose,
  onSubmit,
}) => {
  const firstInputRef = React.useRef<HTMLInputElement | null>(null);
  const [mounted, setMounted] = React.useState(false);

  const hasInput = Boolean(
    values.artist.trim() ||
    values.title.trim() ||
    values.additionalClue.trim()
  );

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const timeoutId = window.setTimeout(() => firstInputRef.current?.focus(), 10);
    return () => window.clearTimeout(timeoutId);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmitting) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSubmitting, onClose, open]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4 sm:p-6">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={() => {
          if (!isSubmitting) onClose();
        }}
      />
      <div className="relative w-full max-w-[28rem] rounded-[1.5rem] border border-neutral-200 bg-white p-5 shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-[1.15rem] font-semibold text-neutral-900">Identify again</h2>
            <p className="text-[13px] leading-relaxed text-neutral-500">
              Provide artist name, artwork title, or any clue you know. We&apos;ll use it as guidance when identifying the artwork again.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!isSubmitting) onClose();
            }}
            className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
            aria-label="Close identify again"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <label className="block space-y-1.5">
            <span className="text-[12px] font-medium text-neutral-700">Artist name</span>
            <input
              ref={firstInputRef}
              type="text"
              value={values.artist}
              onChange={(event) => onValuesChange({ ...values, artist: event.target.value })}
              placeholder="Enter artist name"
              className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-[14px] text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-400"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-[12px] font-medium text-neutral-700">Artwork title</span>
            <input
              type="text"
              value={values.title}
              onChange={(event) => onValuesChange({ ...values, title: event.target.value })}
              placeholder="Enter artwork title"
              className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-[14px] text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-400"
            />
          </label>

          <label className="block space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[12px] font-medium text-neutral-700">Additional clue</span>
              <span className="text-[11px] text-neutral-400">Optional</span>
            </div>
            <textarea
              value={values.additionalClue}
              onChange={(event) => onValuesChange({ ...values, additionalClue: event.target.value })}
              placeholder="Museum, subject, style, partial text, or anything else you remember"
              rows={4}
              className="w-full resize-none rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-[14px] leading-relaxed text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-400"
            />
          </label>

          {error ? (
            <p className="text-[12px] text-red-600">{error}</p>
          ) : (
            <p className="text-[12px] text-neutral-400">Enter at least one clue to continue.</p>
          )}
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-neutral-200 px-4 py-2.5 text-[13px] font-medium text-neutral-600 transition-colors hover:bg-neutral-50 hover:text-neutral-900 disabled:opacity-50"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            className="rounded-full bg-neutral-900 px-4 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
            disabled={isSubmitting || !hasInput}
          >
            {isSubmitting ? 'Identifying…' : 'Identify again'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default IdentifyAgainModal;
