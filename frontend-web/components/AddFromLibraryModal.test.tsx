import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GalleryItem } from '../types';
import AddFromLibraryModal from './AddFromLibraryModal';

function createGalleryItem(overrides: Partial<GalleryItem> = {}): GalleryItem {
  return {
    id: 'item-1',
    artworkId: 'artwork-1',
    url: 'https://example.com/artwork.jpg',
    artworkName: 'Available work',
    artistName: 'Artist',
    keywords: [],
    timestamp: 1,
    conversation: [],
    vibe: {
      backgroundColor: '#fff',
      padding: 4,
      borderRadius: '12px',
      borderType: 'solid',
      accentColor: '#000',
    },
    ...overrides,
  };
}

describe('AddFromLibraryModal', () => {
  it('shows analyzing and already-added artworks but keeps them unavailable', () => {
    const onConfirm = vi.fn();
    const onRefresh = vi.fn();

    render(
      <AddFromLibraryModal
        open
        items={[
          createGalleryItem(),
          createGalleryItem({
            id: 'analyzing',
            artworkName: 'Work in progress',
            isAnalyzing: true,
          }),
          createGalleryItem({
            id: 'already-added',
            artworkName: 'Session work',
            sessionLinks: [{ sessionId: 'session-1' }],
          }),
        ]}
        initialSelectedIds={[]}
        searchValue=""
        currentSessionId="session-1"
        onRefresh={onRefresh}
        onClose={vi.fn()}
        onSearchChange={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Analyzing…')).toBeTruthy();
    expect(screen.getByText('Already added')).toBeTruthy();
    expect((screen.getByText('Work in progress').closest('button') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByText('Session work').closest('button') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByText('Available work').closest('button') as HTMLButtonElement).disabled).toBe(false);
  });

  it('resolves selected ids against the latest artwork data on confirm', () => {
    const onConfirm = vi.fn();
    const original = createGalleryItem();
    const commonProps = {
      open: true,
      initialSelectedIds: [],
      searchValue: '',
      onClose: vi.fn(),
      onSearchChange: vi.fn(),
      onConfirm,
    };

    const { rerender } = render(
      <AddFromLibraryModal
        {...commonProps}
        items={[original]}
      />,
    );

    fireEvent.click(screen.getByText('Available work').closest('button')!);
    expect(screen.getByText('1 selected')).toBeTruthy();

    const updated = { ...original, artworkName: 'Updated work' };
    rerender(
      <AddFromLibraryModal
        {...commonProps}
        items={[updated]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add to chat' }));

    expect(onConfirm).toHaveBeenCalledWith([updated]);
  });

  it('drops a selection that becomes attached to the current session', () => {
    const onConfirm = vi.fn();
    const original = createGalleryItem();
    const commonProps = {
      open: true,
      initialSelectedIds: [],
      searchValue: '',
      currentSessionId: 'session-1',
      onClose: vi.fn(),
      onSearchChange: vi.fn(),
      onConfirm,
    };

    const { rerender } = render(
      <AddFromLibraryModal
        {...commonProps}
        items={[original]}
      />,
    );

    fireEvent.click(screen.getByText('Available work').closest('button')!);
    expect(screen.getByText('1 selected')).toBeTruthy();

    rerender(
      <AddFromLibraryModal
        {...commonProps}
        items={[{
          ...original,
          sessionLinks: [{ sessionId: 'session-1' }],
        }]}
      />,
    );

    expect(screen.getByText('0 selected')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Add to chat' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
