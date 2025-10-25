import { Platform } from 'react-native';

export const listAvailableFonts = () => {
  if (Platform.OS === 'ios') {
    // On iOS, we can use this approach
    const fontFamilyNames = [
      'IBM Plex Mono',
      'IBMPlexMono-Regular',
      'IBMPlexMono-Bold',
      'IBMPlexMono-SemiBold',
      'Ubuntu Mono',
      'UbuntuMono-Regular',
      'WhisperingSignature',
    ];
    
    console.log('=== Testing Font Availability ===');
    fontFamilyNames.forEach(font => {
      console.log(`Font: ${font}`);
    });
    console.log('=== End Font List ===');
    
    return fontFamilyNames;
  }
};
