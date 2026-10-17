import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

function FloatingShape({
  children,
  style,
  delay = 0,
}: {
  children: React.ReactNode;
  style: object;
  delay?: number;
}) {
  const lift = useSharedValue(0);

  React.useEffect(() => {
    lift.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 4200 + delay }),
        withTiming(0, { duration: 4200 + delay }),
      ),
      -1,
      true,
    );
  }, [delay, lift]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: lift.value * -16 },
      { rotate: `${lift.value * 7}deg` },
    ],
  }));

  return (
    <Animated.View entering={FadeIn.duration(900).delay(delay)} style={[styles.shape, style, animatedStyle]}>
      {children}
    </Animated.View>
  );
}

export function FloatingDecorations() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFillObject} className="overflow-hidden">
      <FloatingShape delay={100} style={{ top: 86, left: 58 }}>
        <Flower size={104} />
      </FloatingShape>

      <FloatingShape delay={800} style={{ top: 142, right: 80 }}>
        <PaperPlane />
      </FloatingShape>

      <FloatingShape delay={300} style={{ bottom: 142, left: 92 }}>
        <View className="h-16 w-16 rotate-45 border-2 border-[#FFE76A]/60 bg-[#FF4FB8]/20" />
      </FloatingShape>

      <FloatingShape delay={1200} style={{ bottom: 98, right: 118 }}>
        <View className="h-20 w-20 rounded-full border-2 border-[#23D5FF]/50">
          <View className="m-auto h-10 w-10 rounded-full border-2 border-[#FFE76A]/60" />
        </View>
      </FloatingShape>

      <View style={styles.lineOne} />
      <View style={styles.lineTwo} />
    </View>
  );
}

function Flower({ size }: { size: number }) {
  const petals = ['#FF4B35', '#FF9B26', '#FFE23C', '#83E13D', '#14C775', '#22C7FF', '#306BFF', '#D94BFF'];

  return (
    <View style={{ width: size, height: size }}>
      {petals.map((color, index) => (
        <View
          key={color}
          style={[
            styles.petal,
            {
              width: size * 0.42,
              height: size * 0.62,
              borderRadius: size * 0.3,
              backgroundColor: color,
              left: size * 0.29,
              top: size * 0.04,
              transform: [{ rotate: `${index * 45}deg` }],
              transformOrigin: '50% 75%',
            } as object,
          ]}
        />
      ))}
    </View>
  );
}

function PaperPlane() {
  return (
    <View style={styles.planeWrap}>
      <LinearGradient
        colors={['#FFFFFF', '#FFE76A', '#FF5AA8']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.plane, webClipPath('polygon(0 48%, 100% 0, 74% 100%, 47% 58%)')]}
      />
    </View>
  );
}

const webClipPath = (value: string) =>
  Platform.OS === 'web'
    ? ({
        clipPath: value,
      } as object)
    : {};

const styles = StyleSheet.create({
  shape: {
    position: 'absolute',
    opacity: 0.86,
  },
  petal: {
    position: 'absolute',
    opacity: 0.72,
  },
  planeWrap: {
    width: 88,
    height: 64,
    transform: [{ rotate: '-16deg' }],
  },
  plane: {
    width: 88,
    height: 42,
  },
  lineOne: {
    position: 'absolute',
    top: '33%',
    left: -30,
    width: 250,
    height: 2,
    backgroundColor: 'rgba(255,231,106,0.38)',
    transform: [{ rotate: '-22deg' }],
  },
  lineTwo: {
    position: 'absolute',
    right: -30,
    bottom: '32%',
    width: 280,
    height: 2,
    backgroundColor: 'rgba(35,213,255,0.28)',
    transform: [{ rotate: '-18deg' }],
  },
});
