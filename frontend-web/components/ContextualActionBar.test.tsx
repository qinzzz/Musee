import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  ARTWORK_CTA_ADD_MENU,
  ARTWORK_CTA_SCAN_ARTWORK,
} from '../lib/artworkSourceCtas';
import ContextualActionBar from './ContextualActionBar';

describe('ContextualActionBar session busy state', () => {
  it('keeps the draft editable while disabling every session input action', () => {
    const onInquiry = vi.fn(async () => true);
    const onOpenSessionCapture = vi.fn();

    render(
      <ContextualActionBar
        mode="session"
        onUpload={vi.fn()}
        onOpenSessionCapture={onOpenSessionCapture}
        onOpenLibraryPicker={vi.fn()}
        onInquiry={onInquiry}
        isBusy
      />,
    );

    const textbox = screen.getByRole('textbox');
    fireEvent.change(textbox, { target: { value: 'Keep this draft' } });

    expect((textbox as HTMLInputElement).value).toBe('Keep this draft');
    expect((screen.getByLabelText(ARTWORK_CTA_SCAN_ARTWORK) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText(ARTWORK_CTA_ADD_MENU) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTitle('Session busy') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByLabelText('Session busy')).toBeTruthy();

    fireEvent.submit(textbox.closest('form')!);
    expect(onInquiry).not.toHaveBeenCalled();
    expect(onOpenSessionCapture).not.toHaveBeenCalled();
  });

  it('closes the add menu when the session becomes busy', async () => {
    const props = {
      mode: 'session' as const,
      onUpload: vi.fn(),
      onOpenSessionCapture: vi.fn(),
      onOpenLibraryPicker: vi.fn(),
      onInquiry: vi.fn(async () => true),
    };
    const { rerender } = render(<ContextualActionBar {...props} />);

    fireEvent.keyDown(screen.getByLabelText(ARTWORK_CTA_ADD_MENU), {
      key: 'Enter',
      code: 'Enter',
    });
    expect(await screen.findByText('Add from my collection')).toBeTruthy();

    rerender(<ContextualActionBar {...props} isBusy />);

    await waitFor(() => {
      expect(screen.queryByText('Add from my collection')).toBeNull();
    });
    expect((screen.getByLabelText(ARTWORK_CTA_ADD_MENU) as HTMLButtonElement).disabled).toBe(true);
  });
});
