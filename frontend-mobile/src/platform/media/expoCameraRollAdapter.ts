import * as MediaLibrary from 'expo-media-library';

import type { CameraRollAdapter } from './cameraRoll';

export const expoCameraRollAdapter: CameraRollAdapter = {
  getWritePermission: () => MediaLibrary.getPermissionsAsync(true),
  requestWritePermission: () => MediaLibrary.requestPermissionsAsync(true),
  saveImage: async (uri) => {
    await MediaLibrary.Asset.create(uri);
  },
};
