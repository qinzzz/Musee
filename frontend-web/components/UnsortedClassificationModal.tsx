import React from 'react';
import { GalleryItem, ArtworkClassification } from '../types';
import { Button } from './ui/button';

interface Props {
  open: boolean;
  items: GalleryItem[];
  onClose: () => void;
  onClassify: (itemId: string, classification: ArtworkClassification) => Promise<void>;
}

const ACTIONS: Array<{ value: ArtworkClassification; label: string; variant?: 'primary' | 'secondary' }> = [
  { value: 'love', label: 'Love', variant: 'primary' },
  { value: 'respect', label: 'Respect', variant: 'secondary' },
  { value: 'not_for_me', label: 'Not For Me', variant: 'secondary' },
];

const UnsortedClassificationModal: React.FC<Props> = ({
  open,
  items,
  onClose,
  onClassify,
}) => {
  const unsortedItems = React.useMemo(
    () => items.filter(item => (item.classification || 'unsorted') === 'unsorted'),
    [items],
  );
  const [index, setIndex] = React.useState(0);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setIndex(0);
      setIsSubmitting(false);
    }
  }, [open]);

  React.useEffect(() => {
    if (open && unsortedItems.length === 0) {
      onClose();
    }
  }, [open, unsortedItems.length, onClose]);

  if (!open || unsortedItems.length === 0) return null;

  const current = unsortedItems[index];
  const remaining = unsortedItems.length - index;

  const advance = () => {
    if (index >= unsortedItems.length - 1) {
      onClose();
      return;
    }
    setIndex(prev => prev + 1);
  };

  const handleClassify = async (classification: ArtworkClassification) => {
    if (!current || isSubmitting) return;
    try {
      setIsSubmitting(true);
      await onClassify(current.id, classification);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkip = () => {
    if (isSubmitting) return;
    advance();
  };

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/35 px-4 py-8 backdrop-blur-sm">
      <div className="max-h-[calc(100dvh-32px)] w-full max-w-4xl overflow-y-auto rounded-[34px] bg-[var(--color-bg-primary)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.18)] sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div />
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 text-neutral-500 transition-colors hover:border-neutral-400 hover:text-neutral-800"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {current && (
          <div className="grid gap-6 md:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
            <div className="max-h-[46dvh] overflow-hidden rounded-[26px] bg-neutral-100 md:max-h-none">
              <img src={current.thumbnailUrl || current.url} alt={current.artworkName || 'Artwork'} className="h-full w-full object-cover" />
            </div>
            <div className="flex flex-col justify-between">
              <div className="space-y-1">
                <p className="text-[20px] font-semibold leading-tight text-neutral-900">
                  {current.artworkName || 'Untitled'}
                </p>
                <p className="text-[16px] text-neutral-500">
                  {current.artistName || 'Unknown artist'}
                </p>
              </div>

              <div className="mt-8 grid grid-cols-3 gap-3 md:grid-cols-1">
                {ACTIONS.map(action => (
                  <Button
                    key={action.value}
                    variant={action.variant || 'secondary'}
                    className="w-full justify-center gap-2"
                    disabled={isSubmitting}
                    onClick={() => void handleClassify(action.value)}
                  >
                    <span>{action.label}</span>
                  </Button>
                ))}
                <Button
                  variant="ghost"
                  className="col-span-3 w-full justify-center border border-transparent md:col-span-1"
                  disabled={isSubmitting}
                  onClick={handleSkip}
                >
                  Skip
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between text-[11px] text-neutral-400">
          <span>{remaining} unsorted {remaining === 1 ? 'work' : 'works'} remaining</span>
          <span>{index + 1} / {unsortedItems.length}</span>
        </div>
      </div>
    </div>
  );
};

export default UnsortedClassificationModal;
