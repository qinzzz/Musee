import { describe, expect, it, vi } from 'vitest';

import {
  CameraRollPermissionError,
  saveCapturedImage,
  type CameraRollAdapter,
} from './cameraRoll';

function createAdapter(
  initialGranted: boolean,
  requestedGranted: boolean,
): CameraRollAdapter {
  return {
    getWritePermission: vi.fn().mockResolvedValue({
      granted: initialGranted,
      canAskAgain: !initialGranted,
    }),
    requestWritePermission: vi.fn().mockResolvedValue({
      granted: requestedGranted,
      canAskAgain: requestedGranted,
    }),
    saveImage: vi.fn().mockResolvedValue(undefined),
  };
}

describe('camera roll', () => {
  it('saves immediately when write permission already exists', async () => {
    const adapter = createAdapter(true, true);

    await saveCapturedImage(adapter, 'file:///cache/artwork.jpg');

    expect(adapter.requestWritePermission).not.toHaveBeenCalled();
    expect(adapter.saveImage).toHaveBeenCalledWith('file:///cache/artwork.jpg');
  });

  it('requests write permission before saving', async () => {
    const adapter = createAdapter(false, true);

    await saveCapturedImage(adapter, 'file:///cache/artwork.jpg');

    expect(adapter.requestWritePermission).toHaveBeenCalledOnce();
    expect(adapter.saveImage).toHaveBeenCalledOnce();
  });

  it('does not save when write permission is denied', async () => {
    const adapter = createAdapter(false, false);

    await expect(saveCapturedImage(adapter, 'file:///cache/artwork.jpg'))
      .rejects.toBeInstanceOf(CameraRollPermissionError);
    expect(adapter.saveImage).not.toHaveBeenCalled();
  });
});
