import React from 'react';
import Svg, { Path, G } from 'react-native-svg';
import { colors } from '../../constants/colors';

interface ArrowIconProps {
  size?: number;
  color?: string;
  direction?: 'up' | 'down' | 'left' | 'right';
}

export const ArrowIcon: React.FC<ArrowIconProps> = ({
  size = 20,
  color = colors.darkGrey,
  direction = 'left',
}) => {
  const getRotation = () => {
    switch (direction) {
      case 'up':
        return '180deg';
      case 'down':
        return '0deg';
      case 'right':
        return '-90deg';
      case 'left':
        return '90deg'
      default:
        return '0deg';
    }
  };

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={{ transform: [{ rotate: getRotation() }] }}
    >
      <G
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <Path d="M12 12l-5 -5M12 12l5 -5" />
        <Path d="M12 18l-5 -5M12 18l5 -5" />
      </G>
    </Svg>
  );
};
