import React from 'react';
import { View, StyleSheet, Animated, ScrollView, ImageBackground, TouchableOpacity } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';
import { spacing, borderRadius, shadows } from '../constants/theme';
import { Typography, Heading2, LoadingProgressBar, ActionButton, TopicChip, ArtworkBite } from './index';
import { SavedArtwork } from '../services/savedArtworkApi';
import { softenColor, darkenColor, getContrastColorBW } from '../utils/colorUtils';
import { Dimensions } from 'react-native';

const { height } = Dimensions.get('window');

interface ImmersiveExplorationPanelProps {
    translateY: Animated.Value;
    pulseAnim: Animated.Value;
    isVisible: boolean;
    artwork: SavedArtwork | null;
    artworkBites: Array<{ content: string; topic?: string; role?: 'user' | 'assistant' }>;
    isBiteLoading: boolean;
    isTopicLoading: boolean;
    suggestedTopics: string[];
    onFetchBite: (topic?: string) => void;
    onShuffleTopics: () => void;
    onClose: () => void;
    useBlurBackground: boolean;
    backgroundColor: string;
    photoUri: string;
    currentSelectedTopic: string | null;
}

export const ImmersiveExplorationPanel: React.FC<ImmersiveExplorationPanelProps> = ({
    translateY,
    pulseAnim,
    isVisible,
    artwork,
    artworkBites,
    isBiteLoading,
    isTopicLoading,
    suggestedTopics,
    onFetchBite,
    onShuffleTopics,
    onClose,
    useBlurBackground,
    backgroundColor,
    photoUri,
    currentSelectedTopic,
}) => {
    const safeAreaInsets = useSafeAreaInsets();

    const headingColor = artwork?.color_palette?.primary
        ? darkenColor(artwork.color_palette.primary) : darkenColor(backgroundColor);
    const explorationBgColor = artwork?.color_palette?.primary
        ? softenColor(artwork.color_palette.primary) : backgroundColor;
    const textColor = useBlurBackground ? colors.darkGrey : getContrastColorBW(explorationBgColor);

    const content = (
        <>
            <View style={[styles.header, { paddingTop: isVisible ? safeAreaInsets.top + 30 : safeAreaInsets.top }]}>
                <Heading2 style={{
                    color: headingColor,
                    shadowOpacity: 1,
                    shadowColor: colors.black,
                    shadowRadius: 20
                }}>Explore this piece</Heading2>
            </View>

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={true}
                bounces={true}
            >
                {artworkBites.length > 0 && (
                    <View style={styles.bitesContainer}>
                        {artworkBites.map((bite, index) => (
                            <View key={index} style={styles.biteWithTopicContainer}>
                                {bite.role === 'user' ? (
                                    <View style={styles.selectedTopicContainer}>
                                        <TopicChip
                                            label={bite.content}
                                            onPress={() => { }}
                                            disabled={true}
                                        />
                                    </View>
                                ) : (
                                    <ArtworkBite content={bite.content} textColor={textColor} />
                                )}
                            </View>
                        ))}
                        {currentSelectedTopic && isBiteLoading && (
                            <View style={styles.selectedTopicContainer}>
                                <TopicChip
                                    label={currentSelectedTopic}
                                    onPress={() => { }}
                                    disabled={true}
                                />
                            </View>
                        )}
                    </View>
                )}

                {isBiteLoading && (
                    <View style={styles.loadingContainer}>
                        <LoadingProgressBar message="Conjuring..." />
                    </View>
                )}
                {isTopicLoading && (
                    <View style={styles.loadingContainer}>
                        <LoadingProgressBar />
                    </View>
                )}

                {suggestedTopics.length > 0 && (
                    <View style={styles.topicButtonsContainer}>
                        {suggestedTopics.map((topic, index) => (
                            <TopicChip
                                key={index}
                                label={topic}
                                onPress={() => onFetchBite(topic)}
                            />
                        ))}
                    </View>
                )}
            </ScrollView>

            <View style={styles.footer}>
                <ActionButton
                    label="Tell me more"
                    onPress={() => onFetchBite()}
                />
                <ActionButton
                    label="Shuffle"
                    onPress={onShuffleTopics}
                />
                <ActionButton
                    label="Done"
                    onPress={onClose}
                    theme="light"
                />
            </View>
        </>
    );

    return (
        <Animated.View
            style={[styles.wrapper, { transform: [{ translateY }] }]}
            pointerEvents={isVisible ? "box-none" : "none"}
        >
            <Animated.View style={[styles.auroraGlow, { opacity: pulseAnim }]} />

            <View style={[styles.container, { backgroundColor: useBlurBackground ? 'transparent' : explorationBgColor }]}>
                {useBlurBackground ? (
                    <ImageBackground
                        source={{ uri: photoUri }}
                        style={styles.backgroundImage}
                    >
                        <BlurView
                            style={styles.blurOverlay}
                            intensity={80}
                            tint="light">
                            {content}
                        </BlurView>
                    </ImageBackground>
                ) : content}
            </View>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    wrapper: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: height,
    },
    auroraGlow: {
        shadowColor: 'rgba(118, 165, 230, 0.8)',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 30,
    },
    container: {
        flex: 1,
        width: '100%',
        borderRadius: borderRadius['2xl'],
        ...shadows.lg,
        overflow: 'hidden',
    },
    backgroundImage: {
        flex: 1,
        width: '100%',
        height: '100%',
    },
    blurOverlay: {
        flex: 1,
        width: '100%',
        height: '100%',
    },
    header: {
        paddingHorizontal: spacing['xl'],
        paddingVertical: spacing.lg,
        alignItems: 'center',
    },
    scroll: {
        flex: 1,
    },
    scrollContent: {
        paddingVertical: spacing.lg,
        gap: spacing.base,
    },
    bitesContainer: {
        paddingHorizontal: spacing.xl,
        gap: spacing.base,
        alignItems: 'center',
    },
    biteWithTopicContainer: {
        width: '100%',
        alignItems: 'center',
        gap: spacing.sm,
    },
    selectedTopicContainer: {
        width: '100%',
        alignItems: 'flex-end',
        marginBottom: spacing.lg,
    },
    loadingContainer: {
        marginTop: spacing.lg,
        width: '100%',
        alignItems: 'center',
    },
    topicButtonsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.base,
        justifyContent: 'center',
        paddingHorizontal: spacing.xl,
    },
    footer: {
        flexDirection: 'row',
        gap: spacing.lg,
        paddingHorizontal: spacing['2xl'],
        paddingVertical: spacing.lg,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
