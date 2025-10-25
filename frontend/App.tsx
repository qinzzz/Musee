/**
 * Musee - Ambient Welcome Screen
 * @format
 */

import React, { useState } from 'react';
import {
  StatusBar,
  useColorScheme,
} from 'react-native';
import {
  SafeAreaProvider,
} from 'react-native-safe-area-context';
import WelcomeScreen from './src/screens/WelcomeScreen';
import CameraScreen from './src/screens/CameraScreen';
import PhotoDisplayScreen from './src/screens/PhotoDisplayScreen';
import ArtistIdentificationScreen from './src/screens/ArtistIdentificationScreen';
import SummaryScreen from './src/screens/SummaryScreen';
import GalleryScreen from './src/screens/GalleryScreen';

type ScreenType = 'welcome' | 'camera' | 'photo-display' | 'artist-identification' | 'summary' | 'gallery';

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('welcome');
  const [photoUri, setPhotoUri] = useState<string>('');

  const handlePhotoTaken = (uri: string) => {
    setPhotoUri(uri);
    setCurrentScreen('photo-display');
  };

  const handlePhotoPress = () => {
    setCurrentScreen('artist-identification');
  };

  const handleArtistSelected = (artist: string, title: string) => {
    console.log('Artist selected:', artist, 'Title:', title);
    // TODO: Navigate to next screen or save the selection
    setCurrentScreen('welcome');
  };

  return (
    <SafeAreaProvider>
      <StatusBar
        barStyle="light-content"
        backgroundColor="transparent"
        translucent
      />
      {currentScreen === 'welcome' && (
        <WelcomeScreen
          onCapturePress={() => setCurrentScreen('camera')}
          onGalleryPress={() => setCurrentScreen('gallery')}
        />
      )}
      {currentScreen === 'camera' && (
        <CameraScreen
          onBack={() => setCurrentScreen('welcome')}
          onPhotoTaken={handlePhotoTaken}
        />
      )}
      {currentScreen === 'photo-display' && photoUri && (
        <PhotoDisplayScreen
          photoUri={photoUri}
          onPhotoPress={handlePhotoPress}
          onBack={() => setCurrentScreen('camera')}
          onFinish={() => setCurrentScreen('summary')}
        />
      )}
      {currentScreen === 'summary' && photoUri && (
        <SummaryScreen
          photoUri={photoUri}
          artistName=""
          onBack={() => setCurrentScreen('welcome')}
          onSaveComplete={() => setCurrentScreen('gallery')}
        />
      )}
      {currentScreen === 'gallery' && (
        <GalleryScreen
          onBack={() => setCurrentScreen('welcome')}
        />
      )}
    </SafeAreaProvider>
  );
}


export default App;
