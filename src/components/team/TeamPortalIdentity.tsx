import React from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTeamLeaderContext } from '@/core/contexts/TeamLeaderContext';
import { loginDisplayName } from '@/core/utils/teamLoginPresentation';
import { useTeamUi } from '@/core/contexts/TeamLeaderThemeContext';
import { TeamText } from './TeamText';

export function TeamPortalIdentity() {
  const params = useLocalSearchParams<{ festival?: string | string[]; team?: string | string[] }>();
  const { context } = useTeamLeaderContext();
  const ui = useTeamUi();
  const festival = context?.festival_name || loginDisplayName(params.festival);
  const team = context?.team_name || loginDisplayName(params.team);
  if (!festival && !team) return null;
  return <View style={{ alignItems: 'center', gap: 5, marginBottom: 16, width: '100%' }}>
    {festival ? <TeamText style={{ color: ui.colors.primaryHover, fontSize: 17, lineHeight: 24, fontWeight: '800', textAlign: 'center', letterSpacing: 0.25 }}>{festival}</TeamText> : null}
    {team ? <TeamText style={{ color: ui.colors.text, fontSize: 20, lineHeight: 27, fontWeight: '700', textAlign: 'center' }}>{team}</TeamText> : null}
  </View>;
}
