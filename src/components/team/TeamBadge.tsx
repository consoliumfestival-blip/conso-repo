import React from 'react';
import { View } from 'react-native';
import { teamUi as ui } from '@/constants/teamLeaderTheme';
import { TeamText } from './TeamText';

type Variant = 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info';

export function Badge({ variant = 'default', children, className }: { variant?: Variant; children: React.ReactNode; className?: string }) {
  const colors = variant === 'destructive' ? [ui.colors.dangerSoft, ui.colors.danger]
    : variant === 'success' ? [ui.colors.successSoft, ui.colors.success]
      : variant === 'warning' ? [ui.colors.warningSoft, ui.colors.warning]
        : variant === 'info' ? [ui.colors.infoSoft, ui.colors.info]
          : variant === 'outline' ? [ui.colors.surface, ui.colors.text]
            : [ui.colors.primarySoft, ui.colors.primary];
  return <View className={className} style={{ alignSelf: 'flex-start', borderRadius: 999, borderWidth: variant === 'outline' ? 1 : 0, borderColor: ui.colors.border, backgroundColor: colors[0], paddingHorizontal: 10, paddingVertical: 3 }}>
    <TeamText style={{ color: colors[1], fontSize: 11, fontWeight: '600' }}>{children}</TeamText>
  </View>;
}
