import { File } from 'expo-file-system';
import type { CameraCapturedPicture } from 'expo-camera';
import { createCameraImageAsset } from '../../capture/nativeImageAsset';

export function cameraPhotoAsset(photo: CameraCapturedPicture) {
  return createCameraImageAsset({ ...photo, fileSize: new File(photo.uri).size || undefined });
}
