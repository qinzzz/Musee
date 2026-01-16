import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    Dimensions,
    Platform,
    StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { cameraStyles as styles } from './styles/CameraStyles';
import { ScanlinesEffect, ActionButton } from '../components';
import { savedArtworkApiService } from '../services/savedArtworkApi';
import { colors } from '../constants/colors';
import { useLanguage } from '../contexts/LanguageContext';
import { useIdentity } from '../contexts/IdentityContext';
import { artistAnalysisCache } from '../utils/artistAnalysisCache';

// Web implementation of CameraScreen
export default function CameraScreen({ navigation }: any) {
    const safeAreaInsets = useSafeAreaInsets();
    const { language } = useLanguage();
    const { identity } = useIdentity();
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        setupWebCamera();
        return () => {
            // Cleanup camera stream
            if (videoRef.current && videoRef.current.srcObject) {
                const stream = videoRef.current.srcObject as MediaStream;
                stream.getTracks().forEach(track => track.stop());
            }
        };
    }, []);

    const setupWebCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
        } catch (err) {
            console.error('Error accessing web camera:', err);
        }
    };

    const handleTakePhoto = async () => {
        try {
            if (!videoRef.current) return;
            const canvas = document.createElement('canvas');
            canvas.width = videoRef.current.videoWidth;
            canvas.height = videoRef.current.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(videoRef.current, 0, 0);
            const dataUrl = canvas.toDataURL('image/jpeg');

            // Pre-warm identification (web)
            console.log('[CameraScreen.web] Pre-warming artist identification');
            const identificationPromise = savedArtworkApiService.identifyArtist(dataUrl, identity, language);
            artistAnalysisCache.set(dataUrl, identificationPromise);

            navigation.navigate('ArtworkAnalysis', { photoUri: dataUrl, identity });
        } catch (error) {
            console.error('Failed to take photo (web):', error);
        }
    };

    const handleImportFromAlbum = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e: any) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const dataUrl = event.target?.result as string;
                    // Pre-warm identification
                    const identificationPromise = savedArtworkApiService.identifyArtist(dataUrl, identity, language);
                    artistAnalysisCache.set(dataUrl, identificationPromise);
                    navigation.navigate('ArtworkAnalysis', { photoUri: dataUrl, identity });
                };
                reader.readAsDataURL(file);
            }
        };
        input.click();
    };

    return (
        <View style={[styles.container, { paddingTop: safeAreaInsets.top }]}>
            <TouchableOpacity
                style={[styles.backButton, { top: safeAreaInsets.top + 16 }]}
                onPress={() => navigation.goBack()}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
                <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <Path
                        d="M15 18L9 12L15 6"
                        stroke={colors.darkGrey}
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </Svg>
            </TouchableOpacity>

            <View style={styles.cameraViewfinder}>
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                <ScanlinesEffect />
            </View>

            <View style={styles.controlsContainer}>
                <ActionButton
                    label="album"
                    onPress={handleImportFromAlbum}
                    theme="light"
                />
                <ActionButton
                    label="capture"
                    onPress={handleTakePhoto}
                    theme="dark"
                    style={styles.largeButton}
                />
            </View>
        </View>
    );
}
