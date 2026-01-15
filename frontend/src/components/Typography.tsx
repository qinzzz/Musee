import { Text, TextStyle, StyleSheet, StyleProp } from 'react-native';
import { textStyles } from '../constants/theme';

interface TypographyProps {
  children: React.ReactNode;
  variant?: 'h0' | 'h1' | 'h2' | 'h3' | 'body' | 'bodyLight' | 'label' | 'caption' | 'badge';
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  align?: 'left' | 'center' | 'right';
}

export const Typography: React.FC<TypographyProps> = ({
  children,
  variant = 'body',
  style,
  numberOfLines,
  align = 'left',
}) => {
  return (
    <Text
      style={[
        { paddingRight: 4 }, // Defensive padding for font clipping
        textStyles[variant],
        align && { textAlign: align },
        style
      ]}
      numberOfLines={numberOfLines}
    >
      {children}
    </Text>
  );
};

// Convenience components
export const Heading0: React.FC<Omit<TypographyProps, 'variant'>> = (props) => (
  <Typography {...props} variant="h0" />
);

export const Heading1: React.FC<Omit<TypographyProps, 'variant'>> = (props) => (
  <Typography {...props} variant="h1" />
);

export const Heading2: React.FC<Omit<TypographyProps, 'variant'>> = (props) => (
  <Typography {...props} variant="h2" />
);

export const Heading3: React.FC<Omit<TypographyProps, 'variant'>> = (props) => (
  <Typography {...props} variant="h3" />
);

export const Body: React.FC<Omit<TypographyProps, 'variant'>> = (props) => (
  <Typography {...props} variant="body" />
);

export const Label: React.FC<Omit<TypographyProps, 'variant'>> = (props) => (
  <Typography {...props} variant="label" />
);

export const Caption: React.FC<Omit<TypographyProps, 'variant'>> = (props) => (
  <Typography {...props} variant="caption" />
);
