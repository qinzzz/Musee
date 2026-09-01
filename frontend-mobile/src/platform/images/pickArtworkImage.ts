import * as ImagePicker from 'expo-image-picker';

import { createLibraryImageAsset } from '../../capture/nativeImageAsset';
import type { NativeImageAsset } from '../../capture/types';

export async function pickArtworkImage(): Promise<NativeImageAsset | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 1,
    preferredAssetRepresentationMode:
      ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  });
  if (result.canceled || !result.assets[0]) return null;
  return createLibraryImageAsset(result.assets[0]);
}
