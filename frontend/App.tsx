/**
 * Musee - Ambient Welcome Screen
 * @format
 */

import React, { useState } from 'react';
import {
  StatusBar,
  useColorScheme,
  Alert,
} from 'react-native';
import {
  SafeAreaProvider,
} from 'react-native-safe-area-context';
import { launchImageLibrary } from 'react-native-image-picker';
import { CameraRoll } from '@react-native-camera-roll/camera-roll';
import WelcomeScreen from './src/screens/WelcomeScreen';
import HomePage from './src/screens/HomePage';
import CameraScreen from './src/screens/CameraScreen';
import PhotoDisplayScreen from './src/screens/PhotoDisplayScreen';
import SummaryScreen from './src/screens/SummaryScreen';
import GalleryScreen from './src/screens/GalleryScreen';
import SavedArtworkDetailScreen from './src/screens/SavedArtworkDetailScreen';

type ScreenType = 'welcome' | 'home' | 'camera' | 'photo-display' | 'artist-identification' | 'summary' | 'gallery' | 'artwork-detail';

interface ConversationData {
  artistName: string;
  artworkName: string;
  savedArtworkId: string;
  bites: Array<{ content: string; topic?: string }>;
}

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('welcome');
  const [photoUri, setPhotoUri] = useState<string>('');
  const [selectedIdentity, setSelectedIdentity] = useState<string>('gamified');
  const [conversationData, setConversationData] = useState<ConversationData | null>(null);
  const [selectedArtworkId, setSelectedArtworkId] = useState<string>('');
  const [selectedArtworkPhotoUri, setSelectedArtworkPhotoUri] = useState<string>('');
  const [selectedArtworkBackgroundColor, setSelectedArtworkBackgroundColor] = useState<string | undefined>(undefined);

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

  const handleImportFromAlbum = async () => {
    try {
      // Launch the iOS native photo picker
      const result = await launchImageLibrary({
        mediaType: 'photo',
        selectionLimit: 1,
        quality: 1,
      });

      // User cancelled the picker
      if (result.didCancel) {
        console.log('User cancelled photo picker');
        return;
      }

      // Error occurred
      if (result.errorCode) {
        console.error('ImagePicker Error:', result.errorMessage);
        Alert.alert('Error', 'Failed to access photo library. Please grant permission in Settings.');
        return;
      }

      // Photo selected
      if (result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const originalUri = asset.uri;

        if (originalUri) {
          console.log('Photo imported from album:', originalUri);

          // Check if we already have a ph:// URI (Photos library identifier)
          // If so, use it directly. If it's a file:// URI, we need to get the ph:// reference
          let persistentPhotoUri = originalUri;

          // The iOS image picker returns ph:// URIs when selecting from Photos library
          // We only need to save if it's NOT already a ph:// URI
          if (!originalUri.startsWith('ph://')) {
            try {
              console.log('Converting file:// URI to ph:// identifier...');
              const savedAsset = await CameraRoll.saveAsset(originalUri, {
                type: 'photo',
                album: 'Musee',
              });
              persistentPhotoUri = savedAsset.node.image.uri;
              console.log('Photo saved to Musee album with ph:// URI:', persistentPhotoUri);
            } catch (saveError) {
              console.error('Failed to save to Musee album, using original URI:', saveError);
            }
          } else {
            console.log('Using existing ph:// URI from Photos library:', originalUri);
          }

          // Pass the persistent ph:// URI
          handlePhotoTaken(persistentPhotoUri);
        }
      }
    } catch (error) {
      console.error('Failed to import from album:', error);
      Alert.alert('Error', 'Failed to access photo library. Please try again.');
    }
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
          onPress={() => setCurrentScreen('home')}
        />
      )}
      {currentScreen === 'home' && (
        <HomePage
          onCapturePress={() => setCurrentScreen('camera')}
          onGalleryPress={() => setCurrentScreen('gallery')}
          onImportFromAlbum={handleImportFromAlbum}
        />
      )}
      {currentScreen === 'camera' && (
        <CameraScreen
          onBack={() => setCurrentScreen('home')}
          onPhotoTaken={handlePhotoTaken}
        />
      )}
      {currentScreen === 'photo-display' && photoUri && (
        <PhotoDisplayScreen
          photoUri={photoUri}
          onPhotoPress={handlePhotoPress}
          onBack={() => setCurrentScreen('home')}
          onFinish={(data: ConversationData) => {
            setConversationData(data);
            setCurrentScreen('summary');
          }}
          identity={selectedIdentity}
        />
      )}
      {currentScreen === 'summary' && photoUri && conversationData && (
        <SummaryScreen
          photoUri={photoUri}
          artistName={conversationData.artistName}
          artworkName={conversationData.artworkName}
          savedArtworkId={conversationData.savedArtworkId}
          conversationHistory={conversationData.bites}
          onBack={() => setCurrentScreen('home')}
          onSaveComplete={() => setCurrentScreen('gallery')}
        />
      )}
      {currentScreen === 'gallery' && (
        <GalleryScreen
          onBack={() => setCurrentScreen('home')}
          onGalleryPress={() => setCurrentScreen('gallery')}
          onArtworkPress={(artworkId: string, photoUri: string, backgroundColor?: string) => {
            setSelectedArtworkId(artworkId);
            setSelectedArtworkPhotoUri(photoUri);
            setSelectedArtworkBackgroundColor(backgroundColor);
            setCurrentScreen('artwork-detail');
          }}
        />
      )}
      {currentScreen === 'artwork-detail' && selectedArtworkId && (
        <SavedArtworkDetailScreen
          artworkId={selectedArtworkId}
          onBack={() => setCurrentScreen('gallery')}
          initialPhotoUri={selectedArtworkPhotoUri}
          initialBackgroundColor={selectedArtworkBackgroundColor}
        />
      )}
    </SafeAreaProvider>
  );
}


export default App;
