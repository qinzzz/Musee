import { useRef } from 'react';
import { Animated, PanResponder, Dimensions } from 'react-native';
import { animations } from '../constants/theme';

interface UseNavigationSwipeOptions {
    onSwipeSuccess: () => void;
    threshold?: number;
    direction?: 'right' | 'left' | 'both';
    edgeWidth?: number;
}

export const useNavigationSwipe = ({
    onSwipeSuccess,
    threshold = Dimensions.get('window').width / 2,
    direction = 'right',
    edgeWidth = 50,
}: UseNavigationSwipeOptions) => {
    const swipeTranslateX = useRef(new Animated.Value(0)).current;
    const screenWidth = Dimensions.get('window').width;

    const panResponder = useRef(
        PanResponder.create({
            onMoveShouldSetPanResponder: (evt, gestureState) => {
                const touchX = evt.nativeEvent.pageX;
                const startX = touchX - gestureState.dx;

                const fromLeftEdge = startX < edgeWidth;
                const fromRightEdge = startX > screenWidth - edgeWidth;
                const isRightSwipe = gestureState.dx > 5;
                const isLeftSwipe = gestureState.dx < -5;
                const isHorizontal = Math.abs(gestureState.dx) > Math.abs(gestureState.dy);

                if (direction === 'right') {
                    return fromLeftEdge && isRightSwipe && isHorizontal;
                } else if (direction === 'left') {
                    return fromRightEdge && isLeftSwipe && isHorizontal;
                } else {
                    return (fromLeftEdge && isRightSwipe && isHorizontal) || (fromRightEdge && isLeftSwipe && isHorizontal);
                }
            },
            onPanResponderGrant: () => {
                swipeTranslateX.setOffset(0);
                swipeTranslateX.setValue(0);
            },
            onPanResponderMove: (_, gestureState) => {
                if (direction === 'right' && gestureState.dx > 0) {
                    swipeTranslateX.setValue(gestureState.dx);
                } else if (direction === 'left' && gestureState.dx < 0) {
                    swipeTranslateX.setValue(gestureState.dx);
                } else if (direction === 'both') {
                    swipeTranslateX.setValue(gestureState.dx);
                }
            },
            onPanResponderRelease: (_, gestureState) => {
                const passedThreshold = Math.abs(gestureState.dx) > threshold;

                if (passedThreshold) {
                    Animated.timing(swipeTranslateX, {
                        toValue: gestureState.dx > 0 ? screenWidth : -screenWidth,
                        duration: animations.timing.fast,
                        useNativeDriver: true,
                    }).start(() => {
                        onSwipeSuccess();
                    });
                } else {
                    Animated.spring(swipeTranslateX, {
                        toValue: 0,
                        useNativeDriver: true,
                        ...animations.spring.stiff,
                    }).start();
                }
            },
            onPanResponderTerminate: () => {
                Animated.spring(swipeTranslateX, {
                    toValue: 0,
                    useNativeDriver: true,
                    ...animations.spring.stiff,
                }).start();
            },
        })
    ).current;

    return {
        swipeTranslateX,
        panResponder,
    };
};
