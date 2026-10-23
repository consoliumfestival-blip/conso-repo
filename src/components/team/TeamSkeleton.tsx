import React from 'react';
import { View, ViewProps } from 'react-native';
import { useTeamUi } from '@/core/contexts/TeamLeaderThemeContext';
export function Skeleton({ style, ...props }: ViewProps) {
  const ui = useTeamUi();
  return <View {...props} accessibilityLabel="Loading" style={[{ backgroundColor: ui.colors.surfaceStrong, borderRadius: 12 }, style]} />;
}
