import { forwardRef } from 'react';
import { Platform, ScrollView, type ScrollViewProps } from 'react-native';

// Use the same native dismissal policy for short composer screens and histories.
// Bouncing keeps the drag gesture available even when content fits on screen.
export const KeyboardScrollView = forwardRef<ScrollView, ScrollViewProps>(
  function KeyboardScrollView(props, ref) {
    return <ScrollView {...props} ref={ref}
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      keyboardShouldPersistTaps="handled" alwaysBounceVertical />;
  },
);
