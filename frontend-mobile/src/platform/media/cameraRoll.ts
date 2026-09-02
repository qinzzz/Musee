export type MediaPermission = {
  granted: boolean;
  canAskAgain: boolean;
};

export type CameraRollAdapter = {
  getWritePermission: () => Promise<MediaPermission>;
  requestWritePermission: () => Promise<MediaPermission>;
  saveImage: (uri: string) => Promise<void>;
};

export class CameraRollPermissionError extends Error {
  readonly canAskAgain: boolean;

  constructor(canAskAgain: boolean) {
    super('Musee needs permission to save this photo to your Photos library.');
    this.name = 'CameraRollPermissionError';
    this.canAskAgain = canAskAgain;
  }
}

export async function saveCapturedImage(
  adapter: CameraRollAdapter,
  uri: string,
): Promise<void> {
  let permission = await adapter.getWritePermission();
  if (!permission.granted && permission.canAskAgain) {
    permission = await adapter.requestWritePermission();
  }
  if (!permission.granted) {
    throw new CameraRollPermissionError(permission.canAskAgain);
  }
  await adapter.saveImage(uri);
}
