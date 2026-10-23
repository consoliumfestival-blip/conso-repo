import React from 'react';
import { StyleSheet, Text as NativeText, TextProps } from 'react-native';
import { TEAM_FONT_FAMILY } from '@/constants/teamLeaderTheme';

/** Keep Team Leader text on a standard, loaded sans-serif face across devices. */
export const TeamText = React.forwardRef<React.ElementRef<typeof NativeText>, TextProps>(
  ({ style, ...props }, ref) => {
    const safeStyle = { ...(StyleSheet.flatten(style) || {}) };
    delete safeStyle.fontFamily;
    const fontFamily = TEAM_FONT_FAMILY;
    return <NativeText ref={ref} {...props} style={[safeStyle, fontFamily ? { fontFamily } : undefined]} />;
  },
);

TeamText.displayName = 'TeamText';
