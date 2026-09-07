import { ActivityIndicator, type ActivityIndicatorProps } from 'react-native';
import { colors } from '../tokens/theme';

const COPY = { loading: 'Loading' };
// Keep one native spinner size across screens, list footers, buttons, and toasts.
// Callers may adapt contrast and surrounding spacing, but not the animation size.
type LoadingIndicatorProps = Pick<ActivityIndicatorProps, 'color' | 'style' | 'accessibilityLabel'>;
export function LoadingIndicator({ color = colors.foreground, style, accessibilityLabel = COPY.loading }: LoadingIndicatorProps) {
  return <ActivityIndicator size="small" color={color} style={style}
    accessibilityLabel={accessibilityLabel} accessibilityState={{ busy: true }} />;
}
