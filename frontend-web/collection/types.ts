import type { ReactNode } from 'react';

import type { ArtworkClassification } from '../types';

export type SavedLayout = 'grid' | 'grouped';
export type ActiveFilter = 'all' | ArtworkClassification;

export type SavedFilterOption = {
  id: ActiveFilter;
  label: string;
  count?: number;
  icon?: ReactNode;
};
