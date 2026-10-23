import React from 'react';
import { Text, View } from 'react-native';
import { useTeamUi } from '@/core/contexts/TeamLeaderThemeContext';
import { Card, CardContent } from '@/components/team/TeamCard';
import { Button } from '@/components/team/TeamButton';

export function TeamLeaderDataError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const ui = useTeamUi();
  return (
    <Card>
      <CardContent style={{ padding: 24, alignItems: 'center', gap: 10 }}>
        <Text style={{ color: ui.colors.text, fontSize: 14, fontWeight: '700', textAlign: 'center' }}>
          Unable to load team data
        </Text>
        <Text style={{ color: ui.colors.textMuted, fontSize: 12, textAlign: 'center' }}>{message}</Text>
        <View>
          <Button variant="outline" size="sm" onPress={onRetry}>Retry</Button>
        </View>
      </CardContent>
    </Card>
  );
}
