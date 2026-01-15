import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle, TextInput, ActivityIndicator } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { colors } from '../constants/colors';
import { spacing, borderRadius, shadows } from '../constants/theme';
import { brightenColor, getContrastColorBW } from '../utils/colorUtils';
import { MoreIcon } from './icons/MoreIcon';
import { Tag } from '../services/tagApi';
import { TagManager } from './TagManager';

interface ArtistCardProps {
  artistName: string;
  title: string;
  summary: string;
  tags?: Tag[];
  createdTime?: string;
  createdLocation?: string;
  photoTime?: string;
  location?: string;
  analysis?: string;
  withShadow?: boolean;
  backgroundColor?: string;
  onPress: () => void;
  onEdit?: (artistName: string, title: string, summary: string) => void;
  onRegenerate?: () => void;
  isRegenerating?: boolean;
  artworkId?: string;
  onTagsUpdated?: () => void;
  onEditModeChange?: (isEditing: boolean) => void;
  style?: ViewStyle;
}

export const SavedArtistCard: React.FC<ArtistCardProps> = ({
  artistName,
  title,
  summary,
  tags,
  location,
  photoTime,
  analysis,
  withShadow = false,
  backgroundColor,
  onPress,
  onEdit,
  onRegenerate,
  isRegenerating = false,
  artworkId,
  onTagsUpdated,
  onEditModeChange,
  style,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [editedArtistName, setEditedArtistName] = useState(artistName);
  const [editedTitle, setEditedTitle] = useState(title);
  const [editedSummary, setEditedSummary] = useState(summary);

  const wrapperStyles: ViewStyle[] = [
    styles.cardWrapper,
    withShadow && shadows.md,
    style,
  ].filter(Boolean) as ViewStyle[];

  const cardBackgroundColor = backgroundColor
    ? brightenColor(backgroundColor, 25)
    : colors.white;
  const textColor = getContrastColorBW(cardBackgroundColor)

  const handleEditPress = () => {
    setShowMenu(false);
    setIsEditing(true);
    setEditedArtistName(artistName);
    setEditedTitle(title);
    setEditedSummary(summary);
    onEditModeChange?.(true);
  };

  const handleSave = () => {
    if (onEdit && editedArtistName.trim() && editedTitle.trim()) {
      onEdit(editedArtistName.trim(), editedTitle.trim(), editedSummary.trim());
      setIsEditing(false);
      onEditModeChange?.(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditedArtistName(artistName);
    setEditedTitle(title);
    setEditedSummary(summary);
    onEditModeChange?.(false);
  };

  return (
    <View style={wrapperStyles}>
      {/* Main card */}
      <View style={[styles.card, { backgroundColor: cardBackgroundColor }]}>
        {/* Three-dot menu button */}
        {onEdit && !isEditing && (
          <TouchableOpacity
            style={styles.menuButton}
            onPress={() => setShowMenu(!showMenu)}
          >
            <MoreIcon size={20} color={colors.darkGrey} />
          </TouchableOpacity>
        )}

        {/* Dropdown menu */}
        {showMenu && !isEditing && (
          <View style={styles.dropdownMenu}>
            <TouchableOpacity style={styles.menuItem} onPress={handleEditPress}>
              <Text style={[styles.menuItemText, { color: textColor }]}>Edit</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Overlay to close menu */}
        {/* {showMenu && (
          <TouchableOpacity
            style={styles.menuOverlay}
            activeOpacity={1}
            onPress={() => setShowMenu(false)}
          />
        )} */}

        <TouchableOpacity
          style={styles.content}
          onPress={isEditing ? undefined : onPress}
          activeOpacity={isEditing ? 1 : 0.7}
          disabled={isEditing}
        >
          <View style={styles.textContainer}>
            <Text style={[styles.annotation, { color: textColor }]}>Artist</Text>
            {isEditing ? (
              <TextInput
                style={styles.input}
                value={editedArtistName}
                onChangeText={setEditedArtistName}
                placeholder="Enter artist name"
                placeholderTextColor={colors.midGrey}
                autoCapitalize="words"
              />
            ) : (
              <Text style={[styles.artistName, { color: textColor }]}>{artistName}</Text>
            )}
          </View>

          <View style={styles.textContainer}>
            <Text style={[styles.annotation, { color: textColor }]}>Title</Text>
            {isEditing ? (
              <TextInput
                style={styles.input}
                value={editedTitle}
                onChangeText={setEditedTitle}
                placeholder="Enter artwork title"
                placeholderTextColor={colors.midGrey}
                autoCapitalize="words"
              />
            ) : (
              <Text style={[styles.title, { color: textColor }]}>{title}</Text>
            )}
          </View>

          <View style={styles.textContainer}>
            {isEditing ? (
              <>
                <Text style={[styles.annotation, { color: textColor }]}>Summary</Text>
                <TextInput
                  style={[styles.input]}
                  value={editedSummary}
                  onChangeText={setEditedSummary}
                  placeholder="Enter summary"
                  placeholderTextColor={colors.midGrey}
                  multiline
                  numberOfLines={3}
                />
              </>
            ) : (
              <Text style={[styles.description, { color: textColor }]}>
                {summary === 'Generating analysis...' ? summary : `"${summary}"`}
              </Text>
            )}
          </View>

          {!isEditing && (location || photoTime || tags || analysis || onRegenerate) && (
            <View style={styles.metadataContainer}>
              {location && (
                <View style={styles.metadataRow}>
                  <Text style={[styles.metadataLabel, { color: textColor }]}>Location:</Text>
                  <Text style={[styles.metadataValue, { color: textColor }]}>{location}</Text>
                </View>
              )}
              {photoTime && (
                <View style={styles.metadataRow}>
                  <Text style={[styles.metadataLabel, { color: textColor }]}>Captured:</Text>
                  <Text style={[styles.metadataValue, { color: textColor }]}>{new Date(photoTime).toLocaleDateString()}</Text>
                </View>
              )}
              {artworkId && onTagsUpdated && (
                <View style={styles.tagsSection}>
                  <TagManager
                    artworkId={artworkId}
                    currentTags={tags || []}
                    onTagsUpdated={onTagsUpdated}
                    showTitle={false}
                    style={styles.integratedTagManager}
                  />
                </View>
              )}

              {/* Analysis section or just Regenerate button if analysis is missing/summary is empty */}
              {(analysis || (onRegenerate && (!summary || summary === 'Generating analysis...'))) && (
                <View style={styles.analysisContainer}>
                  <View style={styles.analysisHeader}>
                    <Text style={[styles.annotation, { color: textColor }]}>Analysis</Text>
                    {onRegenerate && (
                      <TouchableOpacity
                        onPress={onRegenerate}
                        disabled={isRegenerating}
                        style={styles.regenerateBtn}
                      >
                        {isRegenerating ? (
                          <ActivityIndicator size="small" color={textColor} />
                        ) : (
                          <Text style={[styles.regenerateText, { color: textColor }]}>REGENERATE</Text>
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                  {analysis ? (
                    <Markdown
                      style={{
                        body: { ...styles.analysisText, color: textColor } as any,
                        paragraph: { marginTop: 0, marginBottom: spacing.sm },
                      }}
                    >
                      {analysis}
                    </Markdown>
                  ) : !isRegenerating && (
                    <Text style={[styles.analysisText, { color: textColor, fontStyle: 'italic', opacity: 0.7 }]}>
                      Analysis pending. Tap REGENERATE to identify this piece.
                    </Text>
                  )}
                </View>
              )}
            </View>
          )}

          {isEditing && (
            <View style={styles.editButtons}>
              <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
                <Text style={styles.saveButtonText}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  cardWrapper: {
    width: "100%",
    alignItems: 'center',
  },
  card: {
    width: '100%',
    backgroundColor: colors.halfOpacityWhite,
    borderRadius: borderRadius.lg,
    justifyContent: 'center',
  },
  content: {
    width: '100%',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.base,
    gap: spacing.sm,
  },
  textContainer: {
    alignItems: 'flex-start',
    position: 'relative',
  },
  annotation: {
    fontFamily: 'PP Neue Montreal',
    fontSize: 13,
    fontWeight: '400',
    color: colors.darkGrey,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: 'PP Neue Montreal',
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.black,
    textTransform: 'capitalize',
  },
  artistName: {
    fontFamily: 'PP Neue Montreal',
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.black,
    lineHeight: 28,
    textTransform: 'capitalize',
  },
  description: {
    fontFamily: 'PP Neue Montreal',
    fontSize: 16,
    fontWeight: '600',
    color: colors.darkGrey,
    marginTop: spacing.sm,
  },
  menuButton: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    zIndex: 1000,
    padding: spacing.sm,
  },
  dropdownMenu: {
    position: 'absolute',
    top: spacing.base + 24,
    right: spacing.base,
    alignItems: "flex-end",
    zIndex: 1001,
    backgroundColor: colors.quarterOpacityWhite,
    borderRadius: borderRadius.sm,
    ...shadows.md,
  },
  menuItem: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
  },
  menuItemText: {
    fontFamily: 'PP Neue Montreal',
    fontSize: 14,
    color: colors.darkGrey,
  },
  menuOverlay: {
    position: 'absolute',
    top: -1000,
    left: -1000,
    right: -1000,
    bottom: -1000,
    zIndex: 999,
  },
  input: {
    fontFamily: 'PP Neue Montreal',
    fontSize: 16,
    fontWeight: '400',
    color: colors.black,
    width: "100%",
    borderWidth: 1,
    borderColor: colors.midGrey,
    borderRadius: borderRadius.sm,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.quarterOpacityWhite,
  },
  editButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    justifyContent: 'flex-end',
  },
  saveButton: {
    backgroundColor: colors.black,
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
  },
  saveButtonText: {
    fontFamily: 'PP Neue Montreal',
    fontSize: 14,
    fontWeight: '500',
    color: colors.white,
  },
  cancelButton: {
    backgroundColor: colors.lightGrey,
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
  },
  cancelButtonText: {
    fontFamily: 'PP Neue Montreal',
    fontSize: 14,
    fontWeight: '500',
    color: colors.darkGrey,
  },
  metadataContainer: {
    marginTop: spacing.base,
    gap: spacing.sm,
  },
  metadataRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  metadataLabel: {
    fontFamily: 'PP Neue Montreal',
    fontSize: 13,
    fontWeight: '500',
    color: colors.darkGrey,
  },
  metadataValue: {
    fontFamily: 'PP Neue Montreal',
    fontSize: 13,
    fontWeight: '400',
    color: colors.darkGrey,
    flex: 1,
  },
  tagsSection: {
    width: '100%',
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    width: '100%',
  },
  tag: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.xs,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.midGrey,
  },
  tagText: {
    fontFamily: 'PP Neue Montreal',
    fontSize: 12,
    color: colors.darkGrey,
  },
  integratedTagManager: {
    borderTopWidth: 0,
    paddingVertical: 0,
  },
  analysisContainer: {
    marginTop: spacing.sm,
  },
  analysisHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  regenerateBtn: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  regenerateText: {
    fontFamily: 'PP Neue Montreal',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  analysisText: {
    fontFamily: 'PP Neue Montreal',
    fontSize: 14,
    fontWeight: '400',
    color: colors.darkGrey,
    lineHeight: 20,
  },
});
