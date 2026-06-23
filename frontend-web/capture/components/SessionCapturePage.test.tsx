import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SessionCapturePage, {
  getDisplayedVideoRect,
  insetRect,
  isPointInsideRect,
} from './SessionCapturePage';

type MockTrack = {
  stop: ReturnType<typeof vi.fn>;
};

function installMatchMedia(matchesDesktop = false) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: matchesDesktop,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

function installMediaMocks() {
  const track: MockTrack = {
    stop: vi.fn(),
  };
  const stream = {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  } as unknown as MediaStream;

  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn().mockResolvedValue(stream),
    },
  });

  Object.defineProperty(globalThis.navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: vi.fn((success: (position: GeolocationPosition) => void) => {
        success({
          coords: {
            latitude: 37.78,
            longitude: -122.4,
          } as GeolocationCoordinates,
        } as GeolocationPosition);
      }),
    },
  });

  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value: vi.fn().mockResolvedValue(undefined),
  });

  Object.defineProperty(HTMLDivElement.prototype, 'setPointerCapture', {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(HTMLDivElement.prototype, 'releasePointerCapture', {
    configurable: true,
    value: vi.fn(),
  });

  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: vi.fn(() => ({
      drawImage: vi.fn(),
    })),
  });
  Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
    configurable: true,
    value: function toBlob(callback: (blob: Blob | null) => void) {
      callback(new Blob(['capture'], { type: 'image/jpeg' }));
    },
  });

  Object.defineProperty(globalThis.URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob://capture-preview'),
  });
  Object.defineProperty(globalThis.URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn(),
  });

  return { track };
}

describe('SessionCapturePage', () => {
  beforeEach(() => {
    installMatchMedia(false);
    installMediaMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('switches the active target hint and keeps analyze disabled before artwork capture', async () => {
    render(
      <SessionCapturePage
        onClose={vi.fn()}
        onDirtyChange={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Drag to capture artwork')).toBeTruthy();
    });

    const analyzeButtons = screen.getAllByRole('button', { name: 'Analyze' });
    expect(analyzeButtons.every((button) => (button as HTMLButtonElement).disabled)).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Label - Optional' }));

    expect(screen.getByText('Drag to capture label')).toBeTruthy();
  });

  it('computes an inset interactive region that excludes edge-swipe gutters on mobile', () => {
    const displayedRect = getDisplayedVideoRect(320, 560, 320, 560, 'cover');
    expect(displayedRect).toEqual({
      x: 0,
      y: 0,
      width: 320,
      height: 560,
    });

    const interactiveRect = insetRect(displayedRect!, 28);
    expect(interactiveRect).toEqual({
      x: 28,
      y: 0,
      width: 264,
      height: 560,
    });

    expect(isPointInsideRect({ x: 10, y: 120 }, interactiveRect)).toBe(false);
    expect(isPointInsideRect({ x: 50, y: 120 }, interactiveRect)).toBe(true);
  });
});
