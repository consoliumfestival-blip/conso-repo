import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Image, Platform, StyleSheet, View } from "react-native";

const waves = [
  {
    image: require("@/assets/images/ayatic-loader/wave-1.webp"),
    left: "0%",
    top: "7.669173%",
    width: "34.776119%",
    height: "92.330827%",
    start: 0,
  },
  {
    image: require("@/assets/images/ayatic-loader/wave-2.webp"),
    left: "18.059701%",
    top: "0.150376%",
    width: "31.641791%",
    height: "99.849624%",
    start: 220,
  },
  {
    image: require("@/assets/images/ayatic-loader/wave-3.webp"),
    left: "34.776119%",
    top: "0%",
    width: "37.462687%",
    height: "99.849624%",
    start: 440,
  },
  {
    image: require("@/assets/images/ayatic-loader/wave-4.webp"),
    left: "51.343284%",
    top: "5.714286%",
    width: "40.746269%",
    height: "94.135338%",
    start: 660,
  },
  {
    image: require("@/assets/images/ayatic-loader/wave-5.webp"),
    left: "66.119403%",
    top: "24.210526%",
    width: "33.880597%",
    height: "75.789474%",
    start: 880,
  },
] as const;

function LoadingWave({ wave, reducedMotion }: { wave: (typeof waves)[number]; reducedMotion: boolean }) {
  const phase = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducedMotion) {
      phase.setValue(1);
      return;
    }
    phase.setValue(0);
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(phase, {
          toValue: 1,
          duration: 2000,
          easing: Easing.linear,
          useNativeDriver: false,
        }),
        Animated.timing(phase, {
          toValue: 0,
          duration: 0,
          useNativeDriver: false,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [phase, reducedMotion]);

  const start = wave.start / 2000;
  const revealEnd = (wave.start + 220) / 2000;
  const opacity = reducedMotion
    ? 1
    : phase.interpolate({
        inputRange: wave.start === 0 ? [0, revealEnd, 0.88, 0.97, 1] : [0, start, revealEnd, 0.88, 0.97, 1],
        outputRange: wave.start === 0 ? [0, 1, 1, 0, 0] : [0, 0, 1, 1, 0, 0],
        extrapolate: "clamp",
      });
  const translateY = reducedMotion
    ? 0
    : phase.interpolate({
        inputRange: wave.start === 0 ? [0, revealEnd, 1] : [0, start, revealEnd, 1],
        outputRange: wave.start === 0 ? [9, 0, 0] : [9, 9, 0, 0],
        extrapolate: "clamp",
      });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.wave,
        {
          left: wave.left,
          top: wave.top,
          width: wave.width,
          height: wave.height,
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <Image source={wave.image} resizeMode="stretch" style={styles.waveImage} />
    </Animated.View>
  );
}

export function AyaticLoadingScreen() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    let active = true;
    const updatePreference = (value: boolean) => {
      if (active) setReducedMotion(value);
    };

    if (Platform.OS === "web") {
      if (typeof window === "undefined" || !window.matchMedia) {
        return () => { active = false; };
      }
      const media = window.matchMedia("(prefers-reduced-motion: reduce)");
      updatePreference(media.matches);
      const onChange = (event: MediaQueryListEvent) => updatePreference(event.matches);
      media.addEventListener?.("change", onChange);
      return () => {
        active = false;
        media.removeEventListener?.("change", onChange);
      };
    }

    AccessibilityInfo.isReduceMotionEnabled().then(updatePreference).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", updatePreference);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
      style={[
        styles.screen,
        Platform.OS === "web" ? styles.webScreen : styles.nativeScreen,
      ]}
    >
      <View style={styles.logo}>
        {waves.map((wave) => <LoadingWave key={wave.start} wave={wave} reducedMotion={reducedMotion} />)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFEF9",
    zIndex: 99999,
    elevation: 99999,
  },
  webScreen: {
    position: "fixed" as any,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: "100vw",
    height: "100vh",
  },
  nativeScreen: {
    ...StyleSheet.absoluteFillObject,
  },
  logo: {
    position: "relative",
    width: 144,
    aspectRatio: 670 / 665,
    overflow: "visible",
  },
  wave: {
    position: "absolute",
  },
  waveImage: {
    width: "100%",
    height: "100%",
  },
});
