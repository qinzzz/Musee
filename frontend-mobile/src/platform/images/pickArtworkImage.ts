import * as ImagePicker from 'expo-image-picker';

import { createLibraryImageAsset } from '../../capture/nativeImageAsset';
import type { NativeImageAsset } from '../../capture/types';

export type ArtworkImageSelection = {
  assets: NativeImageAsset[];
  rejectedCount: number;
};

export async function pickArtworkImages(): Promise<ArtworkImageSelection | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    allowsMultipleSelection: true,
    orderedSelection: true,
    selectionLimit: 0,
    quality: 1,
    preferredAssetRepresentationMode:
      ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  });
  if (result.canceled) return null;

  const assets: NativeImageAsset[] = [];
  let rejectedCount = 0;
  result.assets.forEach((asset) => {
    try {
      assets.push(createLibraryImageAsset(asset));
    } catch {
      rejectedCount += 1;
    }
  });
  return { assets, rejectedCount };
}

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
