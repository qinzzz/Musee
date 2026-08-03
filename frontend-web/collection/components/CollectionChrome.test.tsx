import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CollectionChrome from './CollectionChrome';

function renderCollectionChrome(isArtworkSelectionMode = false) {
  const onEnterArtworkSelectionMode = vi.fn();
  const onExitArtworkSelectionMode = vi.fn();

  render(
    <CollectionChrome
      collectTab="saved"
      collectionSearch=""
      collectionSearchPlaceholder="Search artworks"
      showCollectionUpload={true}
      showArtworkSelection={true}
      isArtworkSelectionMode={isArtworkSelectionMode}
      onCollectTabChange={vi.fn()}
      onCollectionSearchChange={vi.fn()}
      onOpenUpload={vi.fn()}
      onEnterArtworkSelectionMode={onEnterArtworkSelectionMode}
      onExitArtworkSelectionMode={onExitArtworkSelectionMode}
    />,
  );

  return { onEnterArtworkSelectionMode, onExitArtworkSelectionMode };
}

describe('CollectionChrome artwork selection control', () => {
  it('enters and exits explicit touch selection mode', () => {
    const enter = renderCollectionChrome(false);
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    expect(enter.onEnterArtworkSelectionMode).toHaveBeenCalledTimes(1);

    const done = renderCollectionChrome(true);
    const doneButtons = screen.getAllByRole('button', { name: 'Done' });
    fireEvent.click(doneButtons[0]);
    expect(done.onExitArtworkSelectionMode).toHaveBeenCalledTimes(1);
  });
});
