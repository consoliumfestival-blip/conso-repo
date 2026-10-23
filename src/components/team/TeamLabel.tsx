import React from 'react';
import { TextProps } from 'react-native';
import { TeamText } from './TeamText';
import { useTeamUi } from '@/core/contexts/TeamLeaderThemeContext';
export function Label({ style, ...props }: TextProps) {
  const ui = useTeamUi();
  return <TeamText {...props} style={[{ color: ui.colors.text, fontSize: 13, fontWeight: '600' }, style]} />;
}
