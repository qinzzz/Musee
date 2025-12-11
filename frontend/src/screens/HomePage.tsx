import React, { useState } from 'react';
import {
  Text,
  View,
  TouchableOpacity,
  Modal,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { homeStyles as styles } from './styles/HomeStyles';
import { Typography, ArtworkPlaceholder } from '../components';
import { MenuIcon } from '../components/icons/MenuIcon';
import { useLanguage } from '../contexts/LanguageContext';
import { colors } from '../constants/colors';
import { spacing, borderRadius, shadows } from '../constants/theme';

interface HomePageProps {
  onCapturePress: () => void;
  onGalleryPress: () => void;
  onImportFromAlbum: () => void;
}

export default function HomePage({
  onCapturePress,
  onGalleryPress,
  onImportFromAlbum,
}: HomePageProps) {
  const safeAreaInsets = useSafeAreaInsets();
  const { language, setLanguage } = useLanguage();
  const [showMenuDropdown, setShowMenuDropdown] = useState(false);

  const languageLabels = {
    en: 'English',
    zh: '中文',
  };

  return (
    <View style={[styles.container, { paddingTop: safeAreaInsets.top }]}>
      {/* Main Content Area */}
      <View style={styles.content}>
        {/* Header Section */}
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
          <Text style={[styles.normalText, {alignSelf: 'flex-end'}]}>Your personal collection / your museum guide / your art journey </Text>
        </View>
        {/* Artwork Image Placeholder */}
        <ArtworkPlaceholder
          onPress={onCapturePress}
          onImportFromAlbum={onImportFromAlbum}
          language={language}
        />

      </View>

      {/* Bottom Navigation Bar */}
      <View style={[styles.bottomNav, { paddingBottom: safeAreaInsets.bottom }]}>
        {/* History Button */}
        <TouchableOpacity
          style={styles.navButton}
          onPress={onGalleryPress}
        >
          <Text style={styles.navLabel}>History</Text>
        </TouchableOpacity>

        {/* Discover Button (Active) */}
        <TouchableOpacity
          style={styles.navButton}
        >
          <Text style={styles.navLabelActive}>Discover</Text>
        </TouchableOpacity>

        {/* Gallery Button */}
        <TouchableOpacity
          style={styles.navButton}
          onPress={onGalleryPress}
        >
          <Text style={styles.navLabel}>Gallery</Text>
        </TouchableOpacity>
      </View>

      {/* Menu Dropdown Modal */}
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

            {/* Language Config */}
            <View style={localStyles.menuSection}>
              <Text style={localStyles.menuSectionTitle}>Language</Text>

              <TouchableOpacity
                style={[
                  localStyles.menuOption,
                  language === 'en' && localStyles.menuOptionSelected,
                ]}
                onPress={() => {
                  setLanguage('en');
                }}
              >
                <Text style={[
                  localStyles.menuOptionText,
                  language === 'en' && localStyles.menuOptionTextSelected,
                ]}>
                  English
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  localStyles.menuOption,
                  language === 'zh' && localStyles.menuOptionSelected,
                ]}
                onPress={() => {
                  setLanguage('zh');
                }}
              >
                <Text style={[
                  localStyles.menuOptionText,
                  language === 'zh' && localStyles.menuOptionTextSelected,
                ]}>
                  中文
                </Text>
              </TouchableOpacity>
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
