/**
 * Musee - Ambient Welcome Screen
 * @format
 */

import React, { useEffect, useState } from 'react';
import {
  StatusBar,
  Text,
  View,
  useColorScheme,
  Dimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  useDerivedValue,
} from 'react-native-reanimated';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import { BlurView } from '@react-native-community/blur';
import { styles, vignetteConfigs } from './src/styles/AppStyles';
import { colors } from './src/constants/colors';

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <SafeAreaProvider>
      <StatusBar 
        barStyle="light-content" 
        backgroundColor="transparent" 
        translucent 
      />
      <WelcomeScreen />
    </SafeAreaProvider>
  );
}

// Animated bubble component using LinearGradient for Reanimated compatibility
const AnimatedBubble = ({ baseX, baseY, colors, rotateValue }) => {
  const { width, height } = Dimensions.get('window');
  const centerX = width * 0.5;
  const centerY = height * 0.5;
  
  const animatedStyle = useAnimatedStyle(() => {
    'worklet';
    const angle = rotateValue.value * 2 * Math.PI;
    const relativeX = (baseX - centerX);
    const relativeY = (baseY - centerY) * 0.7;
    
    const rotatedX = relativeX * Math.cos(angle) - relativeY * Math.sin(angle);
    const rotatedY = relativeX * Math.sin(angle) + relativeY * Math.cos(angle);
    
    return {
      transform: [
        { translateX: rotatedX },
        { translateY: rotatedY },
      ],
    };
  });
  
  return (
    <Animated.View style={[styles.bubble, animatedStyle]}>
      <LinearGradient
        colors={colors}
        style={styles.bubbleGradient}
        start={{ x: 0.5, y: 0.5 }}
        end={{ x: 1, y: 1 }}
      />
    </Animated.View>
  );
};

function WelcomeScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const fadeAnim = useSharedValue(0);
  const rotateAnim = useSharedValue(0);
  
  // Non-linear transformation with sine waves
  const nonLinearRotateValue = useDerivedValue(() => {
    'worklet';
    const baseSpeed = rotateAnim.value;
    // const sineWave = Math.sin(baseSpeed * Math.PI) * 0.3;
    return baseSpeed;
  });
  
  const fullText = 'living museum of your own';
  const [displayedText, setDisplayedText] = useState('');

  const { width, height } = Dimensions.get('window');

  useEffect(() => {
    // Fade in main title
    fadeAnim.value = withTiming(0.9, { duration: 2500 });

    // Typewriter effect for subtitle
    const typewriterTimeout = setTimeout(() => {
      let charIndex = 0;
      const typeInterval = setInterval(() => {
        if (charIndex <= fullText.length) {
          setDisplayedText(fullText.slice(0, charIndex));
          charIndex++;
        } else {
          clearInterval(typeInterval);
        }
      }, 80); // 80ms per character for handwriting speed
    }, 1500); // Start typewriter after 1.5s delay


    // Non-linear randomized rotation animation with Reanimated
    rotateAnim.value = withRepeat(
      withTiming(1, { duration: 30000 }),
      -1, // infinite
      false // don't reverse
    );

    return () => {
      clearTimeout(typewriterTimeout);
    };
  }, [fadeAnim, rotateAnim, fullText]);

  
  // Create animated style for fade in
  const fadeStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      opacity: fadeAnim.value,
    };
  });
  

  return (
    <View style={styles.container}>
      
      <View style={[styles.content, { paddingTop: safeAreaInsets.top - 40, zIndex: 10 }]}>
        <Animated.View style={[styles.welcomeContainer, fadeStyle]}>
          <Text style={styles.appName}>Musee</Text>
          <Text style={styles.subtitle}>{displayedText}</Text>
        </Animated.View>
      </View>

      <BlurView
        style={{...styles.blurOverlay, zIndex: 3}}
        blurType="light"
        blurAmount={1}
        reducedTransparencyFallbackColor="white"
      />

      <View style={{...styles.vignetteContainer, zIndex: 1}}>
        <AnimatedBubble 
          baseX={-width * 0.8} 
          baseY={-height * 0.8} 
          colors={[colors.topLeftVignette, colors.transparent]} 
          rotateValue={nonLinearRotateValue}
        />
        <AnimatedBubble 
          baseX={width * 1.5} 
          baseY={-height * 0.6} 
          colors={[colors.topRightVignette, colors.transparent]} 
          rotateValue={nonLinearRotateValue}
        />
        <AnimatedBubble 
          baseX={-width * 0.8} 
          baseY={height * 1.8} 
          colors={[colors.bottomLeftVignette, colors.transparent]} 
          rotateValue={nonLinearRotateValue}
        />
        <AnimatedBubble 
          baseX={width * 1.5} 
          baseY={height * 1.6} 
          colors={[colors.bottomRightVignette, colors.bottomLeftVignette]} 
          rotateValue={nonLinearRotateValue}
        />
      </View>
      
    </View>
  );
}

export default App;
