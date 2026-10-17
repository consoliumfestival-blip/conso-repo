import React from 'react';
import { Platform, StyleSheet, View, type DimensionValue } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

const particles = Array.from({ length: 24 }, (_, index) => ({
  id: index,
  left: `${(index * 37) % 100}%`,
  top: `${(index * 23) % 92}%`,
  size: 2 + (index % 4),
  opacity: 0.22 + (index % 5) * 0.08,
  color: ['#FFE76A', '#FF4FB8', '#23D5FF', '#2CEB85'][index % 4],
}));

function FloatingBlob({
  style,
  colors,
  delay = 0,
}: {
  style: object;
  colors: readonly [string, string, ...string[]];
  delay?: number;
}) {
  const drift = useSharedValue(0);

  React.useEffect(() => {
    drift.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 5200 + delay }),
        withTiming(0, { duration: 5200 + delay }),
      ),
      -1,
      true,
    );
  }, [delay, drift]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: drift.value * 18 },
      { translateX: drift.value * -14 },
      { scale: 1 + drift.value * 0.045 },
    ],
  }));

  return (
    <Animated.View style={[styles.blob, style, animatedStyle]}>
      <LinearGradient colors={colors} style={StyleSheet.absoluteFillObject} />
    </Animated.View>
  );
}

export function AnimatedBackground() {
  return (
    <View style={StyleSheet.absoluteFillObject} className="overflow-hidden bg-[#170834]">
      <LinearGradient
        colors={['#170834', '#311062', '#4B1277', '#180827']}
        locations={[0, 0.42, 0.72, 1]}
        start={{ x: 0.05, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <FloatingBlob
        colors={['rgba(255,188,45,0.82)', 'rgba(255,69,116,0.18)']}
        style={{ width: 520, height: 520, borderRadius: 260, top: -210, right: 80 }}
      />
      <FloatingBlob
        colors={['rgba(255,56,180,0.72)', 'rgba(76,37,255,0.12)']}
        delay={900}
        style={{ width: 440, height: 440, borderRadius: 220, top: 70, right: -160 }}
      />
      <FloatingBlob
        colors={['rgba(28,222,135,0.62)', 'rgba(31,199,255,0.12)']}
        delay={1400}
        style={{ width: 390, height: 390, borderRadius: 195, bottom: -110, left: -120 }}
      />
      <FloatingBlob
        colors={['rgba(255,92,46,0.62)', 'rgba(255,232,83,0.08)']}
        delay={400}
        style={{ width: 300, height: 300, borderRadius: 150, bottom: 90, right: 210 }}
      />

      <View style={styles.mesh} />
      <View style={styles.vignette} />

      {particles.map((particle) => (
        <View
          key={particle.id}
          style={[
            styles.particle,
            {
              left: particle.left as DimensionValue,
              top: particle.top as DimensionValue,
              width: particle.size,
              height: particle.size,
              borderRadius: particle.size,
              opacity: particle.opacity,
              backgroundColor: particle.color,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  blob: {
    position: 'absolute',
    overflow: 'hidden',
    opacity: 0.82,
    ...Platform.select({
      web: { filter: 'blur(26px)' },
      default: {},
    }),
  },
  mesh: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.18,
    backgroundImage:
      Platform.OS === 'web'
        ? 'linear-gradient(rgba(255,255,255,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.12) 1px, transparent 1px)'
        : undefined,
    backgroundSize: Platform.OS === 'web' ? '72px 72px' : undefined,
  },
  particle: {
    position: 'absolute',
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.8,
    shadowRadius: 10,
  },
  vignette: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(13,3,31,0.18)',
    ...Platform.select({
      web: {
        boxShadow: 'inset 0 0 180px rgba(0,0,0,0.55)',
      },
      default: {},
    }),
  },
});
