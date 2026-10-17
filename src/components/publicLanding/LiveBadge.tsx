import React from 'react';
import { Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

export function LiveBadge() {
  const pulse = useSharedValue(0);

  React.useEffect(() => {
    pulse.value = withRepeat(
      withSequence(withTiming(1, { duration: 950 }), withTiming(0, { duration: 950 })),
      -1,
      false,
    );
  }, [pulse]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.3 + pulse.value * 0.45,
    transform: [{ scale: 1 + pulse.value * 0.18 }],
  }));

  return (
    <View
      className="mb-5 flex-row items-center self-start overflow-hidden rounded-full border bg-white/10 px-4 py-2"
      style={{ borderColor: 'rgba(255,231,106,0.4)' }}
    >
      <View className="mr-3 h-3 w-3 items-center justify-center">
        <Animated.View className="absolute h-3 w-3 rounded-full bg-[#FFE76A]" style={glowStyle} />
        <View className="h-2 w-2 rounded-full bg-[#FFE76A]" />
      </View>
      <Text className="font-poppins-bold uppercase" style={{ color: '#FFE76A', fontSize: 12, letterSpacing: 2 }}>
        Live results are open
      </Text>
    </View>
  );
}
