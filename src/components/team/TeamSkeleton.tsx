import React from 'react';
import { View, ViewProps } from 'react-native';
import { teamUi } from '@/constants/teamLeaderTheme';
export function Skeleton({ style, ...props }: ViewProps) {
  return <View {...props} accessibilityLabel="Loading" style={[{ backgroundColor: teamUi.colors.surfaceStrong, borderRadius: 12 }, style]} />;
}
