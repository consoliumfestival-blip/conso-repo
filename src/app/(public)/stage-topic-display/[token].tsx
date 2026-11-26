import { scheduleTopicDrawService, type PublicStageTopicDisplay } from '@/services/scheduleTopicDrawService';
import { stageTopicSecondsRemaining } from '@/core/utils/stageTopicCountdown';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ScrollView, Text, View, useWindowDimensions } from 'react-native';

function isRtl(value: string) {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(value);
}

export default function StageTopicDisplay() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const displayToken = Array.isArray(token) ? token[0] : token;
  const validToken = !!displayToken && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(displayToken);
  const { width, height } = useWindowDimensions();
  const [now, setNow] = React.useState(() => Date.now());
  const newest = React.useRef<{ token: string; data: PublicStageTopicDisplay } | null>(null);
  const serverOffsetMs = React.useRef(0);
  const query = useQuery({
    queryKey: ['public-stage-topic-display', displayToken],
    queryFn: () => scheduleTopicDrawService.getPublicStageDisplay(displayToken!),
    enabled: validToken,
    retry: 1,
    refetchInterval: 2000,
  });
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  if (query.data && (newest.current?.token !== displayToken
    || query.data.version >= (newest.current?.data.version ?? -1))) {
    if (newest.current?.data !== query.data || newest.current.token !== displayToken) {
      newest.current = { token: displayToken!, data: query.data };
      serverOffsetMs.current = Date.parse(query.data.server_time) - Date.now();
    }
  }
  const state = newest.current?.token === displayToken ? newest.current.data : null;
  const presentation = state?.on_screen;
  const remaining = presentation
    ? stageTopicSecondsRemaining(presentation.published_at, presentation.duration_seconds, serverOffsetMs.current, now)
    : 0;
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const timer = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const compact = width < 620;

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <StatusBar style="dark" backgroundColor="#FFFFFF" />
      {state?.paused ? null : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{
          flexGrow: 1, justifyContent: 'center', alignItems: 'center',
          paddingHorizontal: Math.max(20, width * 0.055), paddingVertical: 24,
        }}>
          {presentation ? (
            <View style={{ width: '100%', minHeight: Math.max(0, height - 48), alignItems: 'center', justifyContent: 'space-between', gap: compact ? 16 : 28 }}>
              <View style={{ alignItems: 'center', gap: compact ? 8 : 12 }}>
                <Text style={{ fontSize: compact ? 24 : 40, fontWeight: '700', color: '#111827', textAlign: 'center' }}>
                  {presentation.item_name}
                </Text>
                <Text style={{ fontSize: compact ? 22 : 34, color: '#374151', textAlign: 'center' }}>
                  Code {presentation.code_letter}
                </Text>
              </View>
              <View style={{ flexGrow: 1, justifyContent: 'center' }}>
                <Text
                  accessibilityRole="header"
                  style={{
                    fontSize: Math.max(30, Math.min(compact ? 48 : 80, width * 0.075, height * 0.12)),
                    lineHeight: Math.max(42, Math.min(compact ? 64 : 108, width * 0.1, height * 0.16)),
                    fontWeight: '700', color: '#111827', textAlign: 'center',
                    writingDirection: isRtl(presentation.topic_text) ? 'rtl' : 'ltr',
                  }}
                >
                  {presentation.topic_text}
                </Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text
                  accessibilityLiveRegion="none"
                  style={{ fontSize: Math.max(44, Math.min(104, width * 0.12)), fontVariant: ['tabular-nums'], fontWeight: '700', color: remaining ? '#14532D' : '#9A3412' }}
                >
                  {remaining ? timer : 'Time up'}
                </Text>
                {query.isError ? <Text style={{ fontSize: 14, color: '#6B7280' }}>Connection lost · retrying</Text> : null}
              </View>
            </View>
          ) : (
            <Text style={{ color: '#111827', fontSize: compact ? 22 : 32, textAlign: 'center' }}>
              {!validToken ? 'Invalid display link' : query.isPending ? 'Loading display…' : query.isError ? 'Display unavailable. Reconnecting…' : state ? 'Waiting for topic' : 'Invalid display link'}
            </Text>
          )}
        </ScrollView>
      )}
    </View>
  );
}
