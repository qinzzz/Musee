import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomePage from '../screens/HomePage';
import CameraScreen from '../screens/CameraScreen';
import ArtworkAnalysisScreen from '../screens/ArtworkAnalysisScreen';
import SummaryScreen from '../screens/SummaryScreen';
import HistoryScreen from '../screens/HistoryScreen';
import CollectionsScreen from '../screens/CollectionsScreen';
import SavedArtworkDetailScreen from '../screens/SavedArtworkDetailScreen';
import CollectionDetailScreen from '../screens/CollectionDetailScreen';

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
    History: undefined;
    Collections: undefined;
    ArtworkDetail: {
        artworkId: string;
        initialPhotoUri?: string;
        initialBackgroundColor?: string;
        artworkIds?: string[];
    };
    CollectionDetail: {
        collectionId: string;
        collectionName: string;
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
            <Stack.Screen name="History" component={HistoryScreen} />
            <Stack.Screen name="Collections" component={CollectionsScreen} />
            <Stack.Screen name="ArtworkDetail" component={SavedArtworkDetailScreen} />
            <Stack.Screen name="CollectionDetail" component={CollectionDetailScreen} />
        </Stack.Navigator>
    );
};
