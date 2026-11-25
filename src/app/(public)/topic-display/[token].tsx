import { scheduleTopicDrawService } from '@/services/scheduleTopicDrawService';
import { useQuery } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { ActivityIndicator, ScrollView, Text, View, useWindowDimensions } from 'react-native';

export default function PublicTopicDisplay() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const displayToken = Array.isArray(token) ? token[0] : token;
  const { width, height } = useWindowDimensions();
  const query = useQuery({
    queryKey: ['public-schedule-topic-display', displayToken],
    queryFn: () => scheduleTopicDrawService.getPublicDisplayTopic(displayToken!),
    enabled: !!displayToken,
    retry: true,
    staleTime: 0,
    refetchInterval: 3000,
    refetchIntervalInBackground: false,
  });
  const topic = query.data?.trim() || '';
  const fontSize = Math.max(30, Math.min(76, width * 0.075, height * 0.14));

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <StatusBar style="dark" backgroundColor="#FFFFFF" />
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, minHeight: '100%', justifyContent: 'center', alignItems: 'center', paddingHorizontal: Math.max(20, width * 0.06), paddingVertical: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {topic ? (
          <Text
            accessibilityRole="header"
            style={{ color: '#000000', fontSize, fontWeight: '700', lineHeight: fontSize * 1.3, textAlign: 'center', writingDirection: /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(topic) ? 'rtl' : 'ltr', width: '100%' }}
          >
            {topic}
          </Text>
        ) : query.isPending ? (
          <ActivityIndicator color="#000000" />
        ) : (
          <Text style={{ color: '#000000', fontSize: Math.max(20, Math.min(32, width * 0.04)), textAlign: 'center' }}>Waiting for topic</Text>
        )}
      </ScrollView>
    </View>
  );
}
