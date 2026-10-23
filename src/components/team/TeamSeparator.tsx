import React from 'react';
import { View, ViewProps } from 'react-native';
import { useTeamUi } from '@/core/contexts/TeamLeaderThemeContext';
export function Separator({ style, ...props }: ViewProps) {
  const ui = useTeamUi();
  return <View {...props} style={[{ height: 1, backgroundColor: ui.colors.border }, style]} />;
}
