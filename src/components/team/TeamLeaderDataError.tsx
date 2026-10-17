import { ui } from '@/constants/designSystem';
import React from 'react';
import { Text, View } from 'react-native';
import { Card, CardContent } from '@/components/ui/shadcn/card';
import { Button } from '@/components/ui/shadcn/button';

export function TeamLeaderDataError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card>
      <CardContent style={{ padding: 24, alignItems: 'center', gap: 10 }}>
        <Text style={{ color: '#102A43', fontSize: 14, fontWeight: '700', textAlign: 'center' }}>
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
