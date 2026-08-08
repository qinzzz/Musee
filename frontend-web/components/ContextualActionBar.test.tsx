import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  ARTWORK_CTA_ADD_MENU,
  ARTWORK_CTA_SCAN_ARTWORK,
} from '../lib/artworkSourceCtas';
import ContextualActionBar, {
  SESSION_QUESTION_PLACEHOLDER,
} from './ContextualActionBar';
import { SESSION_ARTWORK_QUESTION_PLACEHOLDER } from '../session/constants';

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

describe('ContextualActionBar mobile composer', () => {
  it('uses a compact prompt when artworks are staged', () => {
    render(
      <ContextualActionBar
        mode="session"
        onUpload={vi.fn()}
        onOpenSessionCapture={vi.fn()}
        onOpenLibraryPicker={vi.fn()}
        stagedItems={[{ id: 'art-1', previewUrl: 'blob://art-1', label: 'Artwork' }]}
      />,
    );

    expect(screen.getByRole('textbox').getAttribute('placeholder')).toBe(SESSION_ARTWORK_QUESTION_PLACEHOLDER);
  });

  it('expands on focus and keeps Enter available for multiline input', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const onInquiry = vi.fn(async () => true);

    render(
      <ContextualActionBar
        mode="session"
        onUpload={vi.fn()}
        onOpenSessionCapture={vi.fn()}
        onOpenLibraryPicker={vi.fn()}
        onInquiry={onInquiry}
      />,
    );

    const composer = screen.getByRole('textbox');
    expect(composer.tagName).toBe('TEXTAREA');
    expect(composer.getAttribute('placeholder')).toBe(SESSION_QUESTION_PLACEHOLDER);
    expect(composer.parentElement?.className).toContain('items-center');
    fireEvent.focus(composer);
    expect(composer.getAttribute('aria-expanded')).toBe('true');
    expect(composer.parentElement?.className).toContain('items-end');

    fireEvent.change(composer, { target: { value: 'First line' } });
    fireEvent.keyDown(composer, { key: 'Enter', code: 'Enter' });
    expect(onInquiry).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it('retains Enter-to-submit on desktop', async () => {
    const onInquiry = vi.fn(async () => true);
    render(
      <ContextualActionBar
        mode="session"
        onUpload={vi.fn()}
        onOpenSessionCapture={vi.fn()}
        onOpenLibraryPicker={vi.fn()}
        onInquiry={onInquiry}
      />,
    );

    const composer = screen.getByRole('textbox');
    fireEvent.change(composer, { target: { value: 'A desktop reflection' } });
    fireEvent.keyDown(composer, { key: 'Enter', code: 'Enter' });

    await waitFor(() => expect(onInquiry).toHaveBeenCalledWith('A desktop reflection'));
  });
});
