import React from 'react';
import { Platform, Text, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Activity, CalendarDays, Mic2, UsersRound } from 'lucide-react-native';
import type { IconComponent } from './types';

const stats: Array<{
  value: string;
  label: string;
  colors: readonly [string, string, ...string[]];
  Icon: IconComponent;
}> = [
  { value: '120+', label: 'Events', colors: ['#FFB72E', '#FF4B74'], Icon: Mic2 },
  { value: '40+', label: 'Stages', colors: ['#23D5FF', '#2B6DFF'], Icon: CalendarDays },
  { value: '2000+', label: 'Participants', colors: ['#23E186', '#00B77A'], Icon: UsersRound },
  { value: 'LIVE', label: 'Updates', colors: ['#FF4FB8', '#B51DFF'], Icon: Activity },
];

export function StatsSection() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const isTablet = width >= 768;

  return (
    <View className="w-full items-center px-5 pb-12 md:px-8">
      <View
        style={{
          width: '100%',
          maxWidth: 1180,
          alignSelf: 'center',
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 16,
          paddingHorizontal: isDesktop ? 32 : 20,
        }}
      >
        {stats.map((stat, index) => (
          <Animated.View
            key={stat.label}
            entering={FadeInUp.duration(760).delay(120 + index * 80).springify()}
            className="overflow-hidden rounded-xl border bg-white/10 p-5"
            style={[
              {
                width: isDesktop ? undefined : isTablet ? '48%' : '100%',
                flex: isDesktop ? 1 : undefined,
                borderColor: 'rgba(255,255,255,0.15)',
              },
              Platform.select({
                web: {
                  backdropFilter: 'blur(22px)',
                  boxShadow: '0 20px 70px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.16)',
                },
                default: {},
              }),
            ]}
          >
            <View className="flex-row items-center justify-between">
              <LinearGradient colors={stat.colors} className="h-12 w-12 items-center justify-center rounded-2xl">
                <stat.Icon color="#FFFFFF" size={23} strokeWidth={2.2} />
              </LinearGradient>
              <View className="h-10 w-10 rounded-full" style={{ backgroundColor: stat.colors[0], opacity: 0.18 }} />
            </View>
            <Text className="mt-5 font-poppins-black" style={{ color: '#FFFFFF', fontSize: 34, lineHeight: 38 }}>
              {stat.value}
            </Text>
            <Text className="mt-1 font-poppins-bold uppercase" style={{ color: 'rgba(255,255,255,0.58)', fontSize: 13, letterSpacing: 1.8 }}>
              {stat.label}
            </Text>
          </Animated.View>
        ))}
      </View>
    </View>
  );
}
