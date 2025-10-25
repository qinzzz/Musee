import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Alert,
  Dimensions,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';
import { API_BASE_URL, API_ENDPOINTS } from '../constants/api';
import { saveAnalysis, ArtworkAnalysis } from '../services/storage';
import { ArtistCard, FramedArtworkCard } from '../components';

interface Artist {
  name: string;
  confidence: number;
  details?: string;
  description?: string;
}

interface Props {
  photoUri: string;
  onBack: () => void;
  onSelectArtist: (artist: string, title: string) => void;
}

const CONFIDENCE_THRESHOLD = 6;

export default function ArtistIdentificationScreen({ photoUri, onBack, onSelectArtist }: Props) {
  const safeAreaInsets = useSafeAreaInsets();
  const { width } = Dimensions.get('window');

  const [streamingText, setStreamingText] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [showManualInput, setShowManualInput] = useState<boolean>(false);
  const [manualArtist, setManualArtist] = useState<string>('');
  const [manualTitle, setManualTitle] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    analyzeArtwork();
  }, []);

  const analyzeArtwork = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const formData = new FormData();
      formData.append('image', {
        uri: photoUri,
        type: 'image/jpeg',
        name: 'artwork.jpg',
      } as any);

      const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.ANALYZE_ARTIST}`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to analyze artwork');
      }

      const data = await response.json();
      const analysisText = data.analysis;

      setStreamingText(analysisText);
      setIsLoading(false);
      parseArtists(analysisText);
    } catch (err) {
      console.error('Error analyzing artwork:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setIsLoading(false);
    }
  };

  const parseArtists = (text: string) => {
    // Extract potential artists from the response
    const artistMatches = text.matchAll(/- (.+?) \(confidence score (\d+)\/10\)/g);
    const parsedArtists: Artist[] = [];

    for (const match of artistMatches) {
      parsedArtists.push({
        name: match[1].trim(),
        confidence: parseInt(match[2], 10),
        details: `${new Date().getFullYear()} - Contemporary Style`,
        description: 'Concentric circles, geometric forms, and dynamic color contrasts—hallmarks of modern artistic style.',
      });
    }

    if (parsedArtists.length > 0) {
      setArtists(parsedArtists.slice(0, 3)); // Top 3 artists
    }
  };

  const handleArtistSelect = async (artist: Artist) => {
    try {
      // Save to local storage
      const analysis: ArtworkAnalysis = {
        id: Date.now().toString(),
        photoUri,
        artistName: artist.name,
        artistConfidence: artist.confidence,
        analysisText: streamingText,
        timestamp: new Date().toISOString(),
      };
      await saveAnalysis(analysis);
      onSelectArtist(artist.name, 'Unknown');
    } catch (error) {
      console.error('Error saving analysis:', error);
      Alert.alert('Warning', 'Artist selected but failed to save to local storage');
      onSelectArtist(artist.name, 'Unknown');
    }
  };

  const handleManualSubmit = async () => {
    if (manualArtist.trim() === '') {
      Alert.alert('Error', 'Please enter the artist name');
      return;
    }

    try {
      // Save to local storage
      const analysis: ArtworkAnalysis = {
        id: Date.now().toString(),
        photoUri,
        artistName: manualArtist.trim(),
        analysisText: streamingText,
        timestamp: new Date().toISOString(),
      };
      await saveAnalysis(analysis);
      onSelectArtist(manualArtist.trim(), manualTitle.trim() || 'Unknown');
    } catch (error) {
      console.error('Error saving analysis:', error);
      Alert.alert('Warning', 'Artist submitted but failed to save to local storage');
      onSelectArtist(manualArtist.trim(), manualTitle.trim() || 'Unknown');
    }
  };

  const handleCardPress = (index: number, artist: Artist) => {
    if (expandedIndex === index) {
      // If already expanded, select the artist
      handleArtistSelect(artist);
    } else {
      // Otherwise, expand the card
      setExpandedIndex(index);
    }
  };

  const renderArtistOptions = () => {
    if (artists.length === 0) {
      return null;
    }

    return (
      <View style={artistIdentificationStyles.artistOptionsContainer}>
        <Text style={artistIdentificationStyles.questionText}>
          Is this the artist?
        </Text>

        <View style={artistIdentificationStyles.cardList}>
          {artists.map((artist, index) => (
            <ArtistCard
              key={index}
              artistName={artist.name}
              details={artist.details || `Confidence: ${artist.confidence * 10}%`}
              description={artist.description}
              isExpanded={expandedIndex === index}
              onPress={() => handleCardPress(index, artist)}
              style={artistIdentificationStyles.artistCard}
            />
          ))}
        </View>

        <TouchableOpacity
          style={artistIdentificationStyles.noneOfAboveButton}
          onPress={() => setShowManualInput(true)}
        >
          <Text style={artistIdentificationStyles.noneOfAboveText}>
            None of the above? Manual input
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderManualInput = () => {
    if (!showManualInput) {
      return null;
    }

    return (
      <View style={artistIdentificationStyles.manualInputContainer}>
        <Text style={artistIdentificationStyles.manualInputTitle}>
          Enter Artwork Details
        </Text>

        <TextInput
          style={artistIdentificationStyles.textInput}
          placeholder="Artist Name *"
          placeholderTextColor={colors.halfOpacityWhite}
          value={manualArtist}
          onChangeText={setManualArtist}
        />

        <TextInput
          style={artistIdentificationStyles.textInput}
          placeholder="Artwork Title (optional)"
          placeholderTextColor={colors.halfOpacityWhite}
          value={manualTitle}
          onChangeText={setManualTitle}
        />

        <View style={artistIdentificationStyles.manualInputButtons}>
          <TouchableOpacity
            style={artistIdentificationStyles.cancelButton}
            onPress={() => setShowManualInput(false)}
          >
            <Text style={artistIdentificationStyles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={artistIdentificationStyles.submitButton}
            onPress={handleManualSubmit}
          >
            <Text style={artistIdentificationStyles.submitButtonText}>Submit</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={[artistIdentificationStyles.container, { paddingTop: safeAreaInsets.top }]}>
      {/* Back Button */}
      <TouchableOpacity style={artistIdentificationStyles.backButton} onPress={onBack}>
        <Text style={artistIdentificationStyles.backButtonText}>← Back</Text>
      </TouchableOpacity>

      <ScrollView style={artistIdentificationStyles.scrollView}>
        {/* Image Display */}
        <View style={artistIdentificationStyles.imageContainer}>
          <FramedArtworkCard
            photoUri={photoUri}
          />
        </View>

        {/* Loading State */}
        {isLoading && (
          <View style={artistIdentificationStyles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.techBlue} />
            <Text style={artistIdentificationStyles.loadingText}>
              Analyzing artwork...
            </Text>
          </View>
        )}

        {/* Error State */}
        {error && (
          <View style={artistIdentificationStyles.errorContainer}>
            <Text style={artistIdentificationStyles.errorText}>{error}</Text>
            <TouchableOpacity
              style={artistIdentificationStyles.retryButton}
              onPress={analyzeArtwork}
            >
              <Text style={artistIdentificationStyles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Streaming Analysis Text */}
        {!isLoading && !error && streamingText && (
          <View style={artistIdentificationStyles.analysisContainer}>
            <Text style={artistIdentificationStyles.analysisText}>{streamingText}</Text>
          </View>
        )}

        {/* Artist Options */}
        {!isLoading && !error && renderArtistOptions()}

        {/* Manual Input */}
        {!isLoading && !error && renderManualInput()}
      </ScrollView>
    </View>
  );
}

const artistIdentificationStyles = {
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  backButton: {
    padding: 16,
  },
  backButtonText: {
    color: colors.black,
    fontSize: 18,
    fontWeight: '600' as const,
  },
  scrollView: {
    flex: 1,
  },
  imageContainer: {
    alignItems: 'center' as const,
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  loadingContainer: {
    alignItems: 'center' as const,
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.black,
  },
  errorContainer: {
    alignItems: 'center' as const,
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#FF3B30',
    textAlign: 'center' as const,
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: colors.techBlue,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600' as const,
  },
  analysisContainer: {
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  analysisText: {
    fontSize: 14,
    color: colors.black,
    lineHeight: 22,
  },
  artistOptionsContainer: {
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  questionText: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: colors.black,
    marginBottom: 16,
  },
  cardList: {
    gap: 8,
  },
  artistCard: {
    marginBottom: 0,
  },
  noneOfAboveButton: {
    marginTop: 8,
    padding: 16,
    alignItems: 'center' as const,
  },
  noneOfAboveText: {
    fontSize: 16,
    color: colors.black,
    textDecorationLine: 'underline' as const,
  },
  manualInputContainer: {
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  manualInputTitle: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: colors.black,
    marginBottom: 16,
  },
  textInput: {
    backgroundColor: colors.white,
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    color: colors.black,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  manualInputButtons: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    marginTop: 16,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: colors.lightGrey,
    borderRadius: 8,
    padding: 16,
    marginRight: 8,
    alignItems: 'center' as const,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: colors.black,
  },
  submitButton: {
    flex: 1,
    backgroundColor: colors.techBlue,
    borderRadius: 8,
    padding: 16,
    marginLeft: 8,
    alignItems: 'center' as const,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: colors.white,
  },
};
