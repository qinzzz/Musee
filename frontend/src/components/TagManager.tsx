import React, { useState, useEffect } from 'react';
import {
    View,
    StyleSheet,
    TouchableOpacity,
    Text,
    TextInput,
    ScrollView,
    ActivityIndicator,
    StyleProp,
    ViewStyle,
} from 'react-native';
import { colors } from '../constants/colors';
import { spacing, borderRadius } from '../constants/theme';
import { tagApiService, Tag } from '../services/tagApi';
import { Typography } from './Typography';

interface TagManagerProps {
    artworkId: string;
    currentTags: Tag[];
    onTagsUpdated: () => void;
    style?: StyleProp<ViewStyle>;
    showTitle?: boolean;
}

export const TagManager: React.FC<TagManagerProps> = ({
    artworkId,
    currentTags = [],
    onTagsUpdated,
    style,
    showTitle = true,
}) => {
    const [allTags, setAllTags] = useState<Tag[]>([]);
    const [newTagName, setNewTagName] = useState('');
    const [isAdding, setIsAdding] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [showAllTags, setShowAllTags] = useState(false);

    useEffect(() => {
        if (showAllTags) {
            fetchAllTags();
        }
    }, [showAllTags]);

    const fetchAllTags = async () => {
        setIsLoading(true);
        try {
            const tags = await tagApiService.getTags();
            setAllTags(tags);
        } catch (error) {
            console.error('Failed to fetch tags:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAddTag = async (tagName: string) => {
        if (!tagName.trim()) return;
        setIsAdding(true);
        try {
            // First find or create the tag
            let tag = allTags.find(t => t.name.toLowerCase() === tagName.toLowerCase());
            if (!tag) {
                tag = await tagApiService.createTag(tagName.trim());
            }

            // Then associate it
            await tagApiService.addTagToArtwork(artworkId, tag.id);
            setNewTagName('');
            onTagsUpdated();
            if (showAllTags) fetchAllTags();
        } catch (error) {
            console.error('Failed to add tag:', error);
        } finally {
            setIsAdding(false);
        }
    };

    const handleRemoveTag = async (tagId: string) => {
        try {
            await tagApiService.removeTagFromArtwork(artworkId, tagId);
            onTagsUpdated();
        } catch (error) {
            console.error('Failed to remove tag:', error);
        }
    };

    return (
        <View style={[styles.container, style]}>
            {showTitle && (
                <View style={styles.header}>
                    <Typography variant="h3" style={styles.title}>TAGS</Typography>
                    <TouchableOpacity onPress={() => setShowAllTags(!showAllTags)}>
                        <Typography style={styles.showAllText}>{showAllTags ? 'HIDE' : 'ADD NEW'}</Typography>
                    </TouchableOpacity>
                </View>
            )}

            {!showTitle && (
                <View style={styles.compactHeader}>
                    <Text style={styles.metadataLabel}>Tags:</Text>
                    <TouchableOpacity onPress={() => setShowAllTags(!showAllTags)}>
                        <Typography style={styles.showAllText}>{showAllTags ? 'HIDE' : 'ADD NEW'}</Typography>
                    </TouchableOpacity>
                </View>
            )}

            <View style={styles.tagList}>
                {currentTags.map(tag => (
                    <View key={tag.id} style={styles.tagBadge}>
                        <Text style={styles.tagText}>{tag.name.toUpperCase()}</Text>
                        <TouchableOpacity onPress={() => handleRemoveTag(tag.id)} style={styles.removeBtn}>
                            <Text style={styles.removeText}>✕</Text>
                        </TouchableOpacity>
                    </View>
                ))}
                {currentTags.length === 0 && (
                    <Typography style={styles.emptyText}>No tags yet</Typography>
                )}
            </View>

            {showAllTags && (
                <View style={styles.addSection}>
                    <View style={styles.inputRow}>
                        <TextInput
                            style={styles.input}
                            placeholder="Add tag name..."
                            value={newTagName}
                            onChangeText={setNewTagName}
                            onSubmitEditing={() => handleAddTag(newTagName)}
                            placeholderTextColor={colors.midGrey}
                        />
                        <TouchableOpacity
                            style={[styles.addBtn, !newTagName.trim() && styles.addBtnDisabled]}
                            onPress={() => handleAddTag(newTagName)}
                            disabled={!newTagName.trim() || isAdding}
                        >
                            {isAdding ? <ActivityIndicator size="small" color={colors.white} /> : <Text style={styles.addBtnText}>ADD</Text>}
                        </TouchableOpacity>
                    </View>

                    {isLoading ? (
                        <ActivityIndicator style={{ marginVertical: spacing.base }} />
                    ) : (
                        <View style={styles.suggestedTags}>
                            <Typography style={styles.suggestTitle}>SUGGESTED</Typography>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestScroll}>
                                {allTags
                                    .filter(t => !currentTags.some(ct => ct.id === t.id))
                                    .map(tag => (
                                        <TouchableOpacity
                                            key={tag.id}
                                            style={styles.suggestChip}
                                            onPress={() => handleAddTag(tag.name)}
                                        >
                                            <Text style={styles.suggestText}>{tag.name.toUpperCase()}</Text>
                                        </TouchableOpacity>
                                    ))
                                }
                            </ScrollView>
                        </View>
                    )}
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        width: '100%',
        paddingVertical: spacing.lg,
        borderTopWidth: 1,
        borderTopColor: '#F5F5F5',
    },
    compactHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.xs,
    },
    metadataLabel: {
        fontFamily: 'PP Neue Montreal',
        fontSize: 13,
        fontWeight: '500',
        color: colors.darkGrey,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.base,
    },
    title: {
        fontSize: 12,
        letterSpacing: 1,
        color: colors.black,
    },
    showAllText: {
        fontSize: 10,
        fontFamily: 'PP Neue Montreal Medium',
        color: colors.techBlue || '#007AFF',
    },
    tagList: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm,
    },
    tagBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.black,
        paddingLeft: spacing.base,
        paddingRight: 6,
        paddingVertical: 6,
        borderRadius: 20,
    },
    tagText: {
        color: colors.white,
        fontSize: 10,
        fontFamily: 'PP Neue Montreal',
        fontWeight: '600',
        letterSpacing: 0.5,
    },
    removeBtn: {
        marginLeft: 6,
        width: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: 'rgba(255,255,255,0.2)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    removeText: {
        color: colors.white,
        fontSize: 8,
    },
    emptyText: {
        color: colors.midGrey,
        fontStyle: 'italic',
        fontSize: 12,
    },
    addSection: {
        marginTop: spacing.lg,
        backgroundColor: '#FAFAFA',
        padding: spacing.base,
        borderRadius: 12,
    },
    inputRow: {
        flexDirection: 'row',
        gap: spacing.sm,
    },
    input: {
        flex: 1,
        height: 40,
        backgroundColor: colors.white,
        borderRadius: 8,
        paddingHorizontal: spacing.base,
        borderWidth: 1,
        borderColor: '#EEEEEE',
        fontFamily: 'PP Neue Montreal',
        fontSize: 14,
    },
    addBtn: {
        backgroundColor: colors.black,
        paddingHorizontal: spacing.lg,
        height: 40,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    addBtnDisabled: {
        opacity: 0.5,
    },
    addBtnText: {
        color: colors.white,
        fontFamily: 'PP Neue Montreal',
        fontWeight: '600',
        fontSize: 12,
    },
    suggestedTags: {
        marginTop: spacing.lg,
    },
    suggestTitle: {
        fontSize: 10,
        color: colors.midGrey,
        marginBottom: spacing.xs,
        letterSpacing: 1,
    },
    suggestScroll: {
        gap: spacing.xs,
    },
    suggestChip: {
        backgroundColor: colors.white,
        borderWidth: 1,
        borderColor: '#EEEEEE',
        paddingHorizontal: spacing.base,
        paddingVertical: 4,
        borderRadius: 12,
    },
    suggestText: {
        fontSize: 10,
        fontFamily: 'PP Neue Montreal',
        color: colors.darkGrey,
    },
});
