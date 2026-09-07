import { ArtworkPicker } from '../../library/components/ArtworkPicker';
import type { ComponentProps } from 'react';

export function SessionArtworkPicker(props: ComponentProps<typeof ArtworkPicker>) {
  return <ArtworkPicker {...props} requireAnalysisReady />;
}
