import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomePage from '../screens/HomePage';
import CameraScreen from '../screens/CameraScreen';
import ArtworkAnalysisScreen from '../screens/ArtworkAnalysisScreen';
import SummaryScreen from '../screens/SummaryScreen';
import GalleryScreen from '../screens/GalleryScreen';
import CollectionsScreen from '../screens/CollectionsScreen';
import SavedArtworkDetailScreen from '../screens/SavedArtworkDetailScreen';

export type RootStackParamList = {
    Home: undefined;
    Camera: undefined;
    ArtworkAnalysis: { photoUri: string; identity?: string; metadata?: any };
    Summary: {
        photoUri: string;
        artistName: string;
        artworkName: string;
        savedArtworkId: string;
        conversationHistory: any[]
    };
    Gallery: undefined;
    Collections: undefined;
    ArtworkDetail: {
        artworkId: string;
        initialPhotoUri?: string;
        initialBackgroundColor?: string;
        artworkIds?: string[];
    };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export const AppNavigator = () => {
    return (
        <Stack.Navigator
            initialRouteName="Home"
            screenOptions={{
                headerShown: false,
                animation: 'fade',
            }}
        >
            <Stack.Screen name="Home" component={HomePage} />
            <Stack.Screen name="Camera" component={CameraScreen} />
            <Stack.Screen name="ArtworkAnalysis" component={ArtworkAnalysisScreen} />
            <Stack.Screen name="Summary" component={SummaryScreen} />
            <Stack.Screen name="Gallery" component={GalleryScreen} />
            <Stack.Screen name="Collections" component={CollectionsScreen} />
            <Stack.Screen name="ArtworkDetail" component={SavedArtworkDetailScreen} />
        </Stack.Navigator>
    );
};
