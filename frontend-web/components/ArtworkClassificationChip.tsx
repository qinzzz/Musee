import React from 'react';
import { ArtworkClassification } from '../types';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';

const OPTIONS: Array<{ value: ArtworkClassification; label: string; emoji: string }> = [
  { value: 'love', label: 'Love', emoji: '❤️' },
  { value: 'respect', label: 'Respect', emoji: '🎓' },
  { value: 'not_for_me', label: 'Not For Me', emoji: '⏭' },
  { value: 'unsorted', label: 'Unsorted', emoji: '○' },
];

const CHIP_STYLES: Record<ArtworkClassification, string> = {
  love: 'border-rose-200 bg-white/92 text-rose-700',
  respect: 'border-amber-200 bg-white/92 text-amber-800',
  not_for_me: 'border-slate-200 bg-white/92 text-slate-700',
  unsorted: 'border-neutral-200 bg-white/92 text-neutral-600',
};

interface Props {
  classification: ArtworkClassification;
  onChange: (classification: ArtworkClassification) => void | Promise<void>;
  className?: string;
  compact?: boolean;
}

const ArtworkClassificationChip: React.FC<Props> = ({
  classification,
  onChange,
  className = '',
  compact = false,
}) => {
  const current = OPTIONS.find(option => option.value === classification) || OPTIONS[3];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(event) => event.stopPropagation()}
          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-medium tracking-[0.06em] shadow-sm backdrop-blur transition-colors hover:border-neutral-300 ${CHIP_STYLES[classification]} ${className}`}
          aria-label={`Classification: ${current.label}`}
        >
          <span className={compact ? 'text-[11px]' : 'text-[12px]'}>{current.emoji}</span>
          <span>{compact ? current.label : `${current.label}`}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[170px]">
        {OPTIONS.map(option => (
          <DropdownMenuItem
            key={option.value}
            onSelect={(event) => {
              event.preventDefault();
              void onChange(option.value);
            }}
            className={option.value === classification ? 'bg-neutral-50' : ''}
          >
            <span className="mr-2 text-[13px]">{option.emoji}</span>
            <span>{option.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ArtworkClassificationChip;
