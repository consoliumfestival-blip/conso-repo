import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export function GradientOverlay() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
      <LinearGradient
        colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0)', 'rgba(0,0,0,0.28)']}
        locations={[0, 0.48, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <LinearGradient
        colors={['rgba(255,183,44,0.18)', 'rgba(255,70,184,0)', 'rgba(35,213,255,0.16)']}
        start={{ x: 0.08, y: 0.12 }}
        end={{ x: 1, y: 0.88 }}
        style={StyleSheet.absoluteFillObject}
      />
    </View>
  );
}
