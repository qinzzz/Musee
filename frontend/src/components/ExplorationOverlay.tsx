import React from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, Modal } from 'react-native';
import { BlurView } from 'expo-blur';
import { Typography, Heading2, LoadingProgressBar, ActionButton, TopicChip, ArtworkBite } from './index';
import { colors } from '../constants/colors';
import { spacing, borderRadius } from '../constants/theme';
import { Dimensions } from 'react-native';

const { height } = Dimensions.get('window');

interface ExplorationOverlayProps {
    isVisible: boolean;
    onClose: () => void;
    artworkBites: Array<{ content: string; topic?: string; role?: 'user' | 'assistant' }>;
    isBiteLoading: boolean;
    isTopicLoading: boolean;
    suggestedTopics: string[];
    onFetchBite: (topic?: string) => void;
    currentSelectedTopic: string | null;
}

export const ExplorationOverlay: React.FC<ExplorationOverlayProps> = ({
    isVisible,
    onClose,
    artworkBites,
    isBiteLoading,
    isTopicLoading,
    suggestedTopics,
    onFetchBite,
    currentSelectedTopic,
}) => {
    return (
        <Modal
            visible={isVisible}
            transparent={true}
            animationType="slide"
            onRequestClose={onClose}
        >
            <View style={styles.explorationOverlay}>
                <BlurView
                    style={styles.explorationContent}
                    intensity={80}
                    tint="light"
                >
                    <View style={styles.explorationHeader}>
                        <Heading2>Explore this piece</Heading2>
                        <TouchableOpacity onPress={onClose}>
                            <Typography style={styles.closeButton}>✕</Typography>
                        </TouchableOpacity>
                    </View>

                    <ScrollView
                        style={styles.explorationScroll}
                        contentContainerStyle={styles.explorationScrollContent}
                        showsVerticalScrollIndicator={true}
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
                                            <>
                                                {bite.topic && (
                                                    <View style={styles.selectedTopicContainer}>
                                                        <TopicChip
                                                            label={bite.topic}
                                                            onPress={() => { }}
                                                            disabled={true}
                                                        />
                                                    </View>
                                                )}
                                                <ArtworkBite content={bite.content} />
                                            </>
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

                        {(isBiteLoading || isTopicLoading) && (
                            <View style={styles.biteLoadingContainer}>
                                <LoadingProgressBar message={isBiteLoading ? "Conjuring..." : undefined} />
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

                    <View style={styles.explorationFooter}>
                        <ActionButton
                            label="Tell me more"
                            onPress={() => onFetchBite()}
                        />
                        <ActionButton
                            label="Done"
                            onPress={onClose}
                            theme="light"
                        />
                    </View>
                </BlurView>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    explorationOverlay: {
        flex: 1,
        height: height * 0.9,
        justifyContent: 'flex-end',
    },
    explorationContent: {
        backgroundColor: 'rgba(255, 255, 255, 0.47)',
        borderTopLeftRadius: borderRadius.xl,
        borderTopRightRadius: borderRadius.xl,
        height: height * 0.9,
        overflow: 'hidden',
    },
    explorationHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: spacing['xl'],
        paddingVertical: spacing.lg,
    },
    closeButton: {
        fontSize: 28,
        fontWeight: '300',
        color: colors.darkGrey,
    },
    explorationScroll: {
        flex: 1,
    },
    explorationScrollContent: {
        paddingHorizontal: spacing['2xl'],
        paddingVertical: spacing.lg,
        gap: spacing.base,
    },
    bitesContainer: {
        width: '100%',
        alignItems: 'center',
        gap: spacing.base,
    },
    biteWithTopicContainer: {
        width: '100%',
        alignItems: 'center',
        gap: spacing.sm,
    },
    selectedTopicContainer: {
        width: '100%',
        alignItems: 'center',
        marginBottom: spacing.lg,
    },
    biteLoadingContainer: {
        marginTop: spacing.lg,
        width: '100%',
        alignItems: 'center',
    },
    topicButtonsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.base,
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        marginTop: spacing.lg,
    },
    explorationFooter: {
        flexDirection: 'row',
        gap: spacing.base,
        paddingHorizontal: spacing['2xl'],
        paddingVertical: spacing.lg,
        borderTopWidth: 1,
        borderTopColor: colors.midGrey,
        justifyContent: 'space-between',
    },
});
