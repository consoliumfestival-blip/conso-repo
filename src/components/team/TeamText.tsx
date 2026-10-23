import React from 'react';
import { Platform, StyleSheet, Text as NativeText, TextProps } from 'react-native';

/** Keep Team Leader text on a standard, loaded sans-serif face across devices. */
export const TeamText = React.forwardRef<React.ElementRef<typeof NativeText>, TextProps>(
  ({ style, ...props }, ref) => {
    const safeStyle = { ...(StyleSheet.flatten(style) || {}) };
    delete safeStyle.fontFamily;
    const fontFamily = Platform.OS === 'web'
      ? 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
      : undefined;
    return <NativeText ref={ref} {...props} style={[safeStyle, fontFamily ? { fontFamily } : undefined]} />;
  },
);

TeamText.displayName = 'TeamText';
