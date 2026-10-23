import React from 'react';
import { View } from 'react-native';
import { useTeamUi } from '@/core/contexts/TeamLeaderThemeContext';
import { TeamText } from './TeamText';

export function TeamPageHeading({ title, subtitle, teamName, actions }: {
  title: string;
  subtitle?: string;
  teamName?: string | null;
  actions?: React.ReactNode;
}) {
  const ui = useTeamUi();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
      <View style={{ flex: 1, minWidth: 180 }}>
        <TeamText style={{ color: ui.colors.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' }}>
          {teamName || 'Team workspace'}
        </TeamText>
        <TeamText style={{ color: ui.colors.text, fontSize: 24, fontWeight: '800', lineHeight: 30, marginTop: 3 }}>
          {title}
        </TeamText>
        {subtitle ? <TeamText style={{ color: ui.colors.textMuted, fontSize: 12, marginTop: 3 }}>{subtitle}</TeamText> : null}
      </View>
      {actions}
    </View>
  );
}
