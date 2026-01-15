import React, { useRef, useState, useEffect } from 'react';
import { View, Image, TouchableOpacity, StyleSheet, Animated, Dimensions, Easing } from 'react-native';
import { Typography, Label } from './Typography';
import { colors } from '../constants/colors';
import { borderRadius, shadows, animations } from '../constants/theme';
import { normalizeImageUri } from '../utils/imageUtils';

const { width, height } = Dimensions.get('window');

interface FlippableArtworkCardProps {
    photoUri: string;
    photoUriNoBackground?: string | null;
    showBackgroundRemoved?: boolean;
}

export const FlippableArtworkCard: React.FC<FlippableArtworkCardProps> = ({
    photoUri,
    photoUriNoBackground,
    showBackgroundRemoved,
}) => {
    const [isFlipped, setIsFlipped] = useState(false);
    const flipAnimation = useRef(new Animated.Value(0)).current;
    const cardSlideAnim = useRef(new Animated.Value(-height)).current;

    useEffect(() => {
        // Initial slide down animation
        Animated.timing(cardSlideAnim, {
            toValue: 0,
            duration: animations.timing.slow,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();
    }, [cardSlideAnim]);

    const flipCard = () => {
        Animated.timing(flipAnimation, {
            toValue: isFlipped ? 0 : 180,
            duration: animations.timing.slow,
            useNativeDriver: true,
        }).start();
        setIsFlipped(!isFlipped);
    };

    const frontInterpolate = flipAnimation.interpolate({
        inputRange: [0, 180],
        outputRange: ['0deg', '180deg'],
    });

    const backInterpolate = flipAnimation.interpolate({
        inputRange: [0, 180],
        outputRange: ['180deg', '360deg'],
    });

    const frontOpacity = flipAnimation.interpolate({
        inputRange: [0, 90, 90, 180],
        outputRange: [1, 1, 0, 0],
    });

    const backOpacity = flipAnimation.interpolate({
        inputRange: [0, 90, 90, 180],
        outputRange: [0, 0, 1, 1],
    });

    return (
        <Animated.View
            style={[
                styles.cardContainer,
                {
                    transform: [{ translateY: cardSlideAnim }],
                },
            ]}
        >
            <TouchableOpacity activeOpacity={0.95} onPress={flipCard}>
                <Animated.View
                    style={[
                        styles.imageContainer,
                        {
                            transform: [{ rotateY: frontInterpolate }],
                            opacity: frontOpacity,
                        },
                    ]}
                >
                    <Image
                        source={{
                            uri: normalizeImageUri(showBackgroundRemoved && photoUriNoBackground ? photoUriNoBackground : photoUri)
                        }}
                        style={styles.artworkImage}
                        resizeMode="cover"
                    />
                </Animated.View>
            </TouchableOpacity>

            <TouchableOpacity activeOpacity={1} style={styles.cardBack} onPress={flipCard}>
                <Animated.View
                    style={[
                        styles.imageContainer,
                        {
                            transform: [{ rotateY: backInterpolate }],
                            opacity: backOpacity,
                        },
                    ]}
                >
                    <View style={styles.metadataWrapper}>
                        <View style={styles.metadataItem}>
                            <Label>Time</Label>
                            <Typography variant="body">{new Date().toLocaleTimeString()}</Typography>
                        </View>
                        <View style={styles.metadataItem}>
                            <Label>Date</Label>
                            <Typography variant="body">{new Date().toLocaleDateString()}</Typography>
                        </View>
                        <View style={styles.metadataItem}>
                            <Label>Location</Label>
                            <Typography variant="body">San Francisco, CA</Typography>
                        </View>
                    </View>
                </Animated.View>
            </TouchableOpacity>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    cardContainer: {
        marginTop: 56, // spacing['7xl'] equivalent or similar
        width: width - 80,
        alignSelf: 'center',
        zIndex: 10000,
    },
    imageContainer: {
        width: width - 80,
        height: width - 80,
        backgroundColor: '#FDFDFD',
        borderRadius: borderRadius.lg,
        ...shadows.lg,
        alignSelf: 'center',
        backfaceVisibility: 'hidden',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
    },
    artworkImage: {
        width: '100%',
        height: '100%',
        backgroundColor: colors.white,
    },
    cardBack: {
        position: 'absolute',
        backfaceVisibility: 'hidden',
        alignItems: 'center',
        alignSelf: 'center',
    },
    metadataWrapper: {
        justifyContent: 'center',
        alignItems: 'flex-start',
        gap: 8,
        padding: 24,
        width: '100%',
    },
    metadataItem: {
        alignItems: 'flex-start',
        gap: 4,
    },
});
