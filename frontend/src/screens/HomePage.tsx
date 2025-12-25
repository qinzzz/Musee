import React, { useState } from 'react';
import {
  Text,
  View,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Alert,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { launchImageLibrary } from 'react-native-image-picker';
import { extractMetadataFromAsset } from '../utils/metadataUtils';
import { CameraRoll } from '@react-native-camera-roll/camera-roll';
import { artistAnalysisCache } from '../utils/artistAnalysisCache';
import { savedArtworkApiService } from '../services/savedArtworkApi';
import { homeStyles as styles } from './styles/HomeStyles';
import { Typography, ArtworkPlaceholder, TodaysPick } from '../components';
import { MenuIcon } from '../components/icons/MenuIcon';
import { useLanguage } from '../contexts/LanguageContext';
import { useIdentity, Identity } from '../contexts/IdentityContext';
import { useTodaysPick } from '../hooks/useTodaysPick';
import { colors } from '../constants/colors';
import { spacing, borderRadius, shadows } from '../constants/theme';

export default function HomePage({ navigation }: any) {
  const safeAreaInsets = useSafeAreaInsets();
  const { language, setLanguage } = useLanguage();
  const { identity, setIdentity } = useIdentity();
  const { picks, isLoading: isPicksLoading } = useTodaysPick();
  const [showMenuDropdown, setShowMenuDropdown] = useState(false);

  const handleImportFromAlbum = async () => {
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        selectionLimit: 1,
        quality: 1,
        includeExtra: true,
      });

      if (result.didCancel) return;

      if (result.errorCode) {
        Alert.alert('Error', 'Failed to access photo library. Please grant permission in Settings.');
        return;
      }

      if (result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const originalUri = asset.uri;

        if (originalUri) {
          const metadata = extractMetadataFromAsset(asset);

          // CRITICAL: Kick off identification in the background early to reduce latency
          // We store the promise in the cache so the analysis screen can pick it up immediately
          console.log('[HomePage] Pre-warming artist identification for:', originalUri, 'with identity:', identity);
          const identificationPromise = savedArtworkApiService.identifyArtist(originalUri, identity, language);
          artistAnalysisCache.set(originalUri, identificationPromise);

          navigation.navigate('ArtworkAnalysis', {
            photoUri: originalUri,
            metadata,
            identity
          });
        }
      }
    } catch (error) {
      console.error('Failed to import from album:', error);
      Alert.alert('Error', 'Failed to access photo library. Please try again.');
    }
  };

  return (
    <View style={[styles.container, { paddingTop: safeAreaInsets.top }]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ alignItems: 'center', paddingBottom: spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerSection}>
          <View style={localStyles.headerRow}>
            <Typography variant="h1" style={styles.title}>DISCOVER</Typography>
            <TouchableOpacity
              style={localStyles.menuButton}
              onPress={() => setShowMenuDropdown(true)}
            >
              <MenuIcon size={24} color={colors.black} />
            </TouchableOpacity>
          </View>
          <Text style={styles.secondaryTitle}>Musee is... </Text>
          <Text style={[styles.normalText, { alignSelf: 'flex-end' }]}>Your personal collection / your museum guide / your art journey </Text>
        </View>

        <ArtworkPlaceholder
          onPress={() => navigation.navigate('Camera')}
          onImportFromAlbum={handleImportFromAlbum}
          language={language}
        />

        <TodaysPick
          picks={picks}
          isLoading={isPicksLoading}
          onPickPress={(pick) => {
            navigation.navigate('ArtworkDetail', {
              artworkId: pick.id,
              initialPhotoUri: pick.uri,
              initialBackgroundColor: pick.backgroundColor,
            });
          }}
        />


      </ScrollView>

      <View style={[styles.bottomNav, { paddingBottom: safeAreaInsets.bottom }]}>
        <TouchableOpacity
          style={styles.navButton}
          onPress={() => navigation.navigate('Gallery')}
        >
          <Text style={styles.navLabel}>History</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navButton}>
          <Text style={styles.navLabelActive}>Discover</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navButton}
          onPress={() => navigation.navigate('Collections')}
        >
          <Text style={styles.navLabel}>Gallery</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={showMenuDropdown}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowMenuDropdown(false)}
      >
        <TouchableOpacity
          style={localStyles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowMenuDropdown(false)}
        >
          <View style={localStyles.menuDropdown}>
            <Text style={localStyles.menuTitle}>Settings</Text>
            <View style={localStyles.menuSection}>
              <Text style={localStyles.menuSectionTitle}>Language</Text>
              <TouchableOpacity
                style={[
                  localStyles.menuOption,
                  language === 'en' && localStyles.menuOptionSelected,
                ]}
                onPress={() => setLanguage('en')}
              >
                <Text style={[
                  localStyles.menuOptionText,
                  language === 'en' && localStyles.menuOptionTextSelected,
                ]}>English</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  localStyles.menuOption,
                  language === 'zh' && localStyles.menuOptionSelected,
                ]}
                onPress={() => setLanguage('zh')}
              >
                <Text style={[
                  localStyles.menuOptionText,
                  language === 'zh' && localStyles.menuOptionTextSelected,
                ]}>中文</Text>
              </TouchableOpacity>
            </View>

            <View style={localStyles.menuSection}>
              <Text style={localStyles.menuSectionTitle}>Persona</Text>
              {(['gamified', 'art_historian', 'museum_narrator'] as Identity[]).map((id) => (
                <TouchableOpacity
                  key={id}
                  style={[
                    localStyles.menuOption,
                    identity === id && localStyles.menuOptionSelected,
                  ]}
                  onPress={() => setIdentity(id)}
                >
                  <Text style={[
                    localStyles.menuOptionText,
                    identity === id && localStyles.menuOptionTextSelected,
                  ]}>
                    {id === 'gamified' ? 'Gamified' :
                      id === 'art_historian' ? 'Art Historian' :
                        'Museum Narrator'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const localStyles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  menuButton: {
    padding: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 60,
    paddingRight: spacing.lg,
  },
  menuDropdown: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    minWidth: 200,
    ...shadows.lg,
  },
  menuTitle: {
    fontFamily: 'IBM Plex Mono',
    fontSize: 16,
    fontWeight: '600',
    color: colors.black,
    marginBottom: spacing.base,
  },
  menuSection: {
    marginTop: spacing.sm,
  },
  menuSectionTitle: {
    fontFamily: 'IBM Plex Mono',
    fontSize: 12,
    fontWeight: '500',
    color: colors.darkGrey,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  menuOption: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    borderRadius: borderRadius.md,
    marginBottom: spacing.xs,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.midGrey,
  },
  menuOptionSelected: {
    backgroundColor: colors.black,
    borderColor: colors.black,
  },
  menuOptionText: {
    fontFamily: 'IBM Plex Mono',
    fontSize: 14,
    color: colors.black,
  },
  menuOptionTextSelected: {
    color: colors.white,
  },
});
