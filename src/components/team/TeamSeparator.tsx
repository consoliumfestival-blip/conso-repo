import React from 'react';
import { View, ViewProps } from 'react-native';
import { teamUi } from '@/constants/teamLeaderTheme';
export function Separator({ style, ...props }: ViewProps) {
  return <View {...props} style={[{ height: 1, backgroundColor: teamUi.colors.border }, style]} />;
}
