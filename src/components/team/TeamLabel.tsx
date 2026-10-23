import React from 'react';
import { TextProps } from 'react-native';
import { TeamText } from './TeamText';
import { teamUi } from '@/constants/teamLeaderTheme';
export function Label({ style, ...props }: TextProps) {
  return <TeamText {...props} style={[{ color: teamUi.colors.text, fontSize: 13, fontWeight: '600' }, style]} />;
}
