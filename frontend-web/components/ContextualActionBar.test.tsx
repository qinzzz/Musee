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
  it('replaces every session input with the guest sign-in prompt when the preview is exhausted', () => {
    const onSignIn = vi.fn();
    render(
      <ContextualActionBar
        mode="session"
        onUpload={vi.fn()}
        onOpenSessionCapture={vi.fn()}
        onOpenLibraryPicker={vi.fn()}
        interactionGate={{
          blocked: true,
          title: 'Keep exploring with an account',
          message: 'You’ve used your guest preview. Sign in to continue this conversation.',
          actionLabel: 'Sign in to continue',
        }}
        onSignIn={onSignIn}
      />,
    );

    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByLabelText(ARTWORK_CTA_SCAN_ARTWORK)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in to continue' }));
    expect(onSignIn).toHaveBeenCalledTimes(1);
  });

  it('disables the empty composer and every session input action', () => {
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
    expect((textbox as HTMLTextAreaElement).disabled).toBe(true);
    expect((textbox as HTMLTextAreaElement).value).toBe('');
    expect((screen.getByLabelText(ARTWORK_CTA_SCAN_ARTWORK) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText(ARTWORK_CTA_ADD_MENU) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTitle('Session busy') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByLabelText('Session busy')).toBeTruthy();

    fireEvent.submit(textbox.closest('form')!);
    expect(onInquiry).not.toHaveBeenCalled();
    expect(onOpenSessionCapture).not.toHaveBeenCalled();
  });

  it('hands off a staged draft immediately and never restores it on failure', async () => {
    let finishSubmission!: (value: boolean) => void;
    const submission = new Promise<boolean>((resolve) => {
      finishSubmission = resolve;
    });
    const onSubmitStagedBatch = vi.fn((_message: string) => submission);

    const Harness = () => {
      const [isBusy, setIsBusy] = React.useState(false);
      const [stagedItems, setStagedItems] = React.useState([
        { id: 'art-1', previewUrl: 'blob://art-1', label: 'Artwork' },
      ]);
      return (
        <ContextualActionBar
          mode="session"
          onUpload={vi.fn()}
          onOpenSessionCapture={vi.fn()}
          onOpenLibraryPicker={vi.fn()}
          stagedItems={stagedItems}
          isSubmittingStagedBatch={isBusy}
          onSubmitStagedBatch={async (message) => {
            setStagedItems([]);
            setIsBusy(true);
            const succeeded = await onSubmitStagedBatch(message);
            setIsBusy(false);
            return succeeded;
          }}
        />
      );
    };

    render(<Harness />);
    const composer = screen.getByRole('textbox');
    fireEvent.focus(composer);
    fireEvent.change(composer, { target: { value: 'What about this piece?' } });
    fireEvent.click(screen.getByTitle('Send'));

    await waitFor(() => {
      expect(onSubmitStagedBatch).toHaveBeenCalledWith('What about this piece?');
      expect((composer as HTMLTextAreaElement).value).toBe('');
      expect((composer as HTMLTextAreaElement).disabled).toBe(true);
      expect(screen.queryByAltText('Artwork')).toBeNull();
      expect(composer.parentElement?.className).toContain('items-center');
    });
    expect(document.activeElement).not.toBe(composer);

    finishSubmission(false);
    await waitFor(() => {
      expect((composer as HTMLTextAreaElement).disabled).toBe(false);
    });
    expect((composer as HTMLTextAreaElement).value).toBe('');
    expect(screen.queryByAltText('Artwork')).toBeNull();
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
