import React from 'react';
import { Text, View } from 'react-native';
import { ui } from '@/constants/designSystem';

export function PortalManagementHeader({ title, description }: { title: string; description: string }) {
  return <View style={{ gap: 4, marginBottom: 16 }}>
    <Text style={{ fontSize: 21, fontWeight: '800', color: ui.colors.text }}>{title}</Text>
    <Text style={{ fontSize: 13, color: ui.colors.textMuted }}>{description}</Text>
  </View>;
}
