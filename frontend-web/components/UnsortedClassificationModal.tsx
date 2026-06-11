import React from 'react';
import { GalleryItem, ArtworkClassification } from '../types';
import { Button } from './ui/button';

interface Props {
  open: boolean;
  items: GalleryItem[];
  onClose: () => void;
  onClassify: (itemId: string, classification: ArtworkClassification) => Promise<void>;
}

const ACTIONS: Array<{ value: ArtworkClassification; label: string; emoji: string; variant?: 'primary' | 'secondary' }> = [
  { value: 'love', label: 'Love', emoji: '❤️', variant: 'primary' },
  { value: 'respect', label: 'Respect', emoji: '🎓', variant: 'secondary' },
  { value: 'not_for_me', label: 'Not For Me', emoji: '⏭', variant: 'secondary' },
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
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/35 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-[34px] bg-[var(--color-bg-primary)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.18)] sm:p-7">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium text-neutral-400">Calibrate taste</p>
            <p className="mt-2 text-[24px] font-semibold text-neutral-900">Sort Unsorted Works</p>
            <p className="mt-2 max-w-lg text-[13px] leading-6 text-neutral-500">
              Classify one artwork at a time. Love and Not For Me shape your taste vector. Respect stays as narrative context.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-neutral-200 px-3 py-1.5 text-[12px] font-medium text-neutral-500 transition-colors hover:border-neutral-400 hover:text-neutral-800"
          >
            Close
          </button>
        </div>

        <div className="mb-4 flex items-center justify-between text-[11px] text-neutral-400">
          <span>{remaining} unsorted {remaining === 1 ? 'work' : 'works'} remaining</span>
          <span>{index + 1} / {unsortedItems.length}</span>
        </div>

        {current && (
          <div className="grid gap-6 md:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
            <div className="overflow-hidden rounded-[26px] bg-neutral-100">
              <img src={current.url} alt={current.artworkName || 'Artwork'} className="h-full w-full object-cover" />
            </div>
            <div className="flex flex-col justify-between rounded-[26px] border border-neutral-200 bg-white p-6">
              <div>
                <p className="text-[11px] font-medium text-neutral-400">Artwork</p>
                <p className="mt-4 text-[29px] font-semibold leading-tight text-neutral-900">
                  {current.artworkName || 'Untitled'}
                </p>
                <p className="mt-3 text-[16px] text-neutral-500">
                  {current.artistName || 'Unknown artist'}
                </p>
              </div>

              <div className="mt-8 space-y-3">
                {ACTIONS.map(action => (
                  <Button
                    key={action.value}
                    variant={action.variant || 'secondary'}
                    className="w-full justify-center gap-2"
                    disabled={isSubmitting}
                    onClick={() => void handleClassify(action.value)}
                  >
                    <span>{action.emoji}</span>
                    <span>{action.label}</span>
                  </Button>
                ))}
                <Button
                  variant="ghost"
                  className="w-full justify-center border border-transparent"
                  disabled={isSubmitting}
                  onClick={handleSkip}
                >
                  Skip
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UnsortedClassificationModal;
