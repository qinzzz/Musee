import React, { useEffect, useState } from 'react';
import {
  Text,
  View,
  Dimensions,
  Pressable,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withRepeat,
  withTiming,
  useDerivedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import { BlurView } from '@react-native-community/blur';
import Svg, { Circle } from 'react-native-svg';
import { styles } from '../styles/AppStyles';
import { colors } from '../constants/colors';

// Animated bubble component using theta-based elliptical motion
const AnimatedBubble = ({ rx, ry, phase = 0, colors, rotateValue }) => {
  const animatedStyle = useAnimatedStyle(() => {
    'worklet';
    const θ = rotateValue.value * 2 * Math.PI + phase;
    // ellipse centered at (0,0); we return relative translations
    const x = rx * Math.cos(θ);
    const y = ry * Math.sin(θ);
    
    return {
      transform: [
        { translateX: x },
        { translateY: y },
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

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export default function WelcomeScreen({ onTouchScreen }) {
  const safeAreaInsets = useSafeAreaInsets();
  const fadeAnim = useSharedValue(0);
  const rotateAnim = useSharedValue(0);
  const radiusAnim = useSharedValue(0);
  
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
      withTiming(2, { duration: 30000 }), // 30 secs
      -1, // infinite
      true // reverse
    );
    radiusAnim.value = withRepeat(
      withTiming(1, {duration: 10000}), // 10 secs
      -1, // infinite
      true // reverse
    );

    return () => {
      clearTimeout(typewriterTimeout);
    };
  }, [fadeAnim, rotateAnim, radiusAnim, fullText]);

  // Create animated style for fade in
  const fadeStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      opacity: fadeAnim.value,
    };
  });

  const animatedPropsLarge = useAnimatedProps(() => ({
    r: (1-radiusAnim.value) * width * 0.6, // radius = 0, to 60% width
  }));
  const animatedPropsSmall = useAnimatedProps(() => ({
    r: radiusAnim.value * height * 0.5, // radius = 0, to 30% width
  }));
  
  const circleX = width * 0.5
  const circleY = height * 0.5

  return (
    <Pressable style={styles.container} onPress={onTouchScreen}>
      
      <View style={[styles.content, { paddingTop: safeAreaInsets.top - 40, zIndex: 10 }]}>
        <Animated.View style={[styles.welcomeContainer, fadeStyle]}>
          <Text style={styles.appName}>Musee</Text>
          <Text style={styles.subtitle}>{displayedText}</Text>
        </Animated.View>
      </View>

      <BlurView
        style={{...styles.blurOverlay, zIndex: 7}}
        blurType="ultraThinMaterialLight"
        blurAmount={30}
        reducedTransparencyFallbackColor="white"
      />

      <Animated.View style={{ ...styles.vignetteContainer, zIndex: 6}}>
        <Svg width="100%" height="100%">
          <AnimatedCircle
            cx={width * 0.5}
            cy={height * 0.1}
            fill={colors.halfOpacityWhite}
            animatedProps={animatedPropsSmall}
          />
          <AnimatedCircle
            cx={width * 0.5}
            cy={height*0.4}
            fill={colors.halfOpacityWhite}
            animatedProps={animatedPropsLarge}
          />
        </Svg>
      </Animated.View>

      <BlurView
        style={{...styles.blurOverlay, zIndex: 5}}
        blurType="ultraThinMaterialLight"
        blurAmount={20}
        reducedTransparencyFallbackColor="white"
      />

      <View style={{...styles.vignetteContainer, zIndex: 1}}>
        <AnimatedBubble 
          rx={circleX*0.5} 
          ry={circleY*0.5} 
          phase={Math.PI / 4}
          colors={[colors.mintGreen, colors.white]} 
          rotateValue={nonLinearRotateValue}
        />
        <AnimatedBubble 
          rx={circleX*1.5} 
          ry={circleY*1.5} 
          phase={3 * Math.PI / 4}
          colors={[colors.lightYellow, colors.mintGreen]} 
          rotateValue={nonLinearRotateValue}
        />
        <AnimatedBubble 
          rx={circleX} 
          ry={circleY} 
          phase={5 * Math.PI / 4}
          colors={[colors.techBlue, colors.lightYellow]} 
          rotateValue={nonLinearRotateValue}
        />
        <AnimatedBubble 
          rx={circleX} 
          ry={circleY} 
          phase={7 * Math.PI / 4}
          colors={[colors.orange, colors.lightYellow]} 
          rotateValue={nonLinearRotateValue}
        />
      </View>
      
    </Pressable>
  );
}