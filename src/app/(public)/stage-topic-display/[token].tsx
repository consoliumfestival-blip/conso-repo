import { scheduleTopicDrawService, type PublicStageTopicDisplay } from '@/services/scheduleTopicDrawService';
import { stageTopicSecondsRemaining } from '@/core/utils/stageTopicCountdown';
import { AyaticLoadingScreen } from '@/components/loading-ui/AyaticLoadingScreen';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { Image, ScrollView, Text, View, useWindowDimensions } from 'react-native';

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

  const background = '#F4F9F8';
  const ink = '#102A35';
  const teal = '#0F766E';
  const idle = state?.paused || !presentation;
  const topicSize = Math.max(26, Math.min(
    compact ? 42 : 72, width * 0.058, height * 0.09,
    (presentation?.topic_text.length ?? 0) > 200 ? 44 : 72,
  ));
  const statusMessage = !validToken ? 'Invalid display link'
    : query.isPending && !state ? 'Connecting to stage…'
    : query.isError ? 'Connection lost · reconnecting…'
    : !state ? 'Display link unavailable' : '';

  return (
    <View style={{ flex: 1, backgroundColor: background }}>
      <StatusBar style="dark" backgroundColor={background} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{
        flexGrow: 1, paddingHorizontal: Math.max(20, width * 0.045),
        paddingVertical: compact ? 24 : 32, alignItems: 'center',
      }}>
        {idle ? (
          <View style={{ flexGrow: 1, width: '100%', justifyContent: 'center', alignItems: 'center', gap: 20 }}>
            <AyaticLoadingScreen inline size={compact ? 100 : 160} />
            <Text className="font-poppins-bold" style={{
              fontSize: compact ? 30 : 48, letterSpacing: compact ? 4 : 7, color: ink, textAlign: 'center',
            }}>CONSOLIUM</Text>
            <View style={{ width: 48, height: 3, borderRadius: 2, backgroundColor: teal }} />
            {!state?.paused && statusMessage ? <Text accessibilityLiveRegion="polite"
              className="font-poppins" style={{ fontSize: 14, color: '#526B73', textAlign: 'center' }}>
              {statusMessage}
            </Text> : null}
          </View>
        ) : (
          <View style={{ width: '100%', maxWidth: 1600, minHeight: Math.max(0, height - (compact ? 48 : 64)), gap: compact ? 24 : 32 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16,
              borderBottomWidth: 1, borderBottomColor: '#D7E5E2', paddingBottom: compact ? 16 : 22 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1, gap: 10 }}>
                <Image source={require('@/assets/images/consolium-crest.png')}
                  accessibilityLabel="Consolium logo" resizeMode="contain" style={{ width: 36, height: 36 }} />
                <Text className="font-poppins-bold" style={{ fontSize: compact ? 13 : 18, letterSpacing: 2, color: ink }}>CONSOLIUM</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: compact ? 12 : 20,
                paddingVertical: 8, backgroundColor: '#E4F1ED', borderRadius: 12, flexShrink: 1 }}>
                <Text className="font-poppins" style={{ fontSize: 12, color: teal }}>CODE</Text>
                <Text className="font-poppins-bold" style={{ fontSize: compact ? 24 : 32, color: teal, flexShrink: 1 }}>{presentation.code_letter}</Text>
              </View>
            </View>
            <Text accessibilityRole="header" className="font-poppins-bold" style={{
              fontSize: compact ? 22 : 34, color: teal, textAlign: 'center',
            }}>{presentation.item_name}</Text>
            <View style={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: compact ? 16 : 28 }}>
              <Text selectable className="font-poppins" style={{
                width: '100%', maxWidth: 1400, fontSize: topicSize, lineHeight: Math.round(topicSize * 1.6),
                fontWeight: '600', color: ink, textAlign: 'center',
                writingDirection: isRtl(presentation.topic_text) ? 'rtl' : 'ltr',
              }}>{presentation.topic_text}</Text>
            </View>
            <View style={{ alignItems: 'center', gap: 10 }}>
              <View style={{ alignItems: 'center', minWidth: compact ? 180 : 240, paddingHorizontal: 28,
                paddingVertical: compact ? 12 : 16, borderRadius: 20, backgroundColor: '#FFFFFF',
                borderWidth: 1, borderColor: remaining ? '#D7E5E2' : '#E9D9C6' }}>
                <Text className="font-poppins" style={{ fontSize: 11, letterSpacing: 2, color: '#526B73' }}>TIME REMAINING</Text>
                <Text accessibilityLiveRegion="none" className="font-poppins-bold" style={{
                  fontSize: compact ? 42 : 64, lineHeight: compact ? 56 : 82, fontVariant: ['tabular-nums'],
                  color: remaining ? teal : '#9A3412',
                }}>{remaining ? timer : 'Time up'}</Text>
              </View>
              {query.isError ? <Text accessibilityLiveRegion="polite" className="font-poppins"
                style={{ fontSize: 12, color: '#526B73' }}>Connection lost · reconnecting…</Text> : null}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
