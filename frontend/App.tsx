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
import ArtistIdentificationScreen from './src/screens/ArtistIdentificationScreen';

type ScreenType = 'welcome' | 'camera' | 'artist-identification';

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('welcome');
  const [photoUri, setPhotoUri] = useState<string>('');

  const handlePhotoTaken = (uri: string) => {
    setPhotoUri(uri);
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
        <WelcomeScreen onTouchScreen={() => setCurrentScreen('camera')} />
      )}
      {currentScreen === 'camera' && (
        <CameraScreen
          onBack={() => setCurrentScreen('welcome')}
          onPhotoTaken={handlePhotoTaken}
        />
      )}
      {currentScreen === 'artist-identification' && photoUri && (
        <ArtistIdentificationScreen
          photoUri={photoUri}
          onBack={() => setCurrentScreen('camera')}
          onSelectArtist={handleArtistSelected}
        />
      )}
    </SafeAreaProvider>
  );
}


export default App;
