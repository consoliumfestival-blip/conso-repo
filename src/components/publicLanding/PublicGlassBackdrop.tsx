import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export const FESTIVAL_BAND_COLORS = ['#6D28D9', '#E11D48', '#2563EB', '#10B981', '#F59E0B'] as const;

export const PUBLIC_GLASS_THEME = {
  bgDeep: '#FAFBFD',
  ink: '#10142F',
  inkMuted: '#525866',
  glassBg: 'rgba(255, 255, 255, 0.92)',
  glassBgStrong: '#FFFFFF',
  glassSurface: '#FFFFFF',
  glassBorder: 'rgba(15, 23, 42, 0.10)',
  glassBorderStrong: 'rgba(15, 23, 42, 0.18)',
  hairline: 'rgba(15, 23, 42, 0.08)',
  surfaceSubtle: '#F1F5F9',
  purple: '#6D28D9',
  purpleSoft: 'rgba(109, 40, 217, 0.09)',
  purpleBorder: 'rgba(109, 40, 217, 0.24)',
  purpleText: '#5B21B6',
  red: '#E11D48',
  redSoft: 'rgba(225, 29, 72, 0.09)',
  redBorder: 'rgba(225, 29, 72, 0.24)',
  redText: '#BE123C',
  blue: '#2563EB',
  blueSoft: 'rgba(37, 99, 235, 0.10)',
  blueBorder: 'rgba(37, 99, 235, 0.26)',
  blueText: '#1D4ED8',
  green: '#10B981',
  greenSoft: 'rgba(16, 185, 129, 0.11)',
  greenBorder: 'rgba(16, 185, 129, 0.28)',
  greenText: '#047857',
  amber: '#F59E0B',
  amberSoft: 'rgba(245, 158, 11, 0.13)',
  amberBorder: 'rgba(245, 158, 11, 0.34)',
  amberText: '#B45309',
  dangerText: '#BE123C',
};

export const webGlassSurface = (blurPx = 18) =>
  Platform.OS === 'web'
    ? ({
        backdropFilter: `blur(${blurPx}px) saturate(1.25)`,
        WebkitBackdropFilter: `blur(${blurPx}px) saturate(1.25)`,
        boxShadow:
          '0 18px 42px -22px rgba(16, 20, 47, 0.15), 0 4px 12px -4px rgba(16, 20, 47, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.96)',
      } as any)
    : {};

export const webPrimaryGradient = Platform.OS === 'web'
  ? ({
      backgroundImage: 'linear-gradient(135deg, #10142F, #1E293B)',
      boxShadow: '0 14px 28px -12px rgba(16, 20, 47, 0.45)',
    } as any)
  : { backgroundColor: '#10142F' };

export function FestivalAccentBar({ height = 5 }: { height?: number }) {
  return (
    <View style={{ height, width: '100%', flexDirection: 'row' }}>
      {FESTIVAL_BAND_COLORS.map((color) => (
        <View key={color} style={{ flex: 1, backgroundColor: color }} />
      ))}
    </View>
  );
}

export function getPublicRankBadgeStyle(rank: number | null) {
  if (rank === 1) {
    return {
      bg: Platform.OS === 'web'
        ? { backgroundImage: 'linear-gradient(135deg, #FEF3C7, #FDE68A)' }
        : { backgroundColor: 'rgba(245, 158, 11, 0.16)' },
      borderColor: 'rgba(245, 158, 11, 0.45)',
      textColor: '#B45309',
    };
  }
  if (rank === 2) {
    return {
      bg: Platform.OS === 'web'
        ? { backgroundImage: 'linear-gradient(135deg, #EFF6FF, #DBEAFE)' }
        : { backgroundColor: 'rgba(37, 99, 235, 0.12)' },
      borderColor: 'rgba(37, 99, 235, 0.36)',
      textColor: '#1D4ED8',
    };
  }
  if (rank === 3) {
    return {
      bg: Platform.OS === 'web'
        ? { backgroundImage: 'linear-gradient(135deg, #ECFDF5, #D1FAE5)' }
        : { backgroundColor: 'rgba(16, 185, 129, 0.14)' },
      borderColor: 'rgba(16, 185, 129, 0.38)',
      textColor: '#047857',
    };
  }
  return {
    bg: { backgroundColor: '#F1F5F9' },
    borderColor: 'rgba(15, 23, 42, 0.12)',
    textColor: '#334155',
  };
}

/**
 * Light modern Consolium 2k26 atmospheric backdrop with subtle blueprint grid and 5-color ambient blooms.
 */
const BG_COLORS = ['#FFFFFF', '#FAFBFD', '#F4F7FC', '#FFFFFF'] as const;
const BG_LOCATIONS = [0, 0.38, 0.72, 1] as const;

export function PublicGlassBackdrop({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.root}>
      <LinearGradient
        colors={BG_COLORS}
        locations={BG_LOCATIONS}
        style={StyleSheet.absoluteFillObject}
      />
      <View pointerEvents="none" style={styles.atmosphereLayer}>
        {Platform.OS === 'web' ? (
          <>
            <View
              style={
                [
                  StyleSheet.absoluteFillObject,
                  {
                    backgroundImage: [
                      'linear-gradient(90deg, rgba(15, 23, 42, 0.032) 1px, transparent 1px)',
                      'linear-gradient(rgba(15, 23, 42, 0.032) 1px, transparent 1px)',
                    ].join(', '),
                    backgroundSize: '56px 56px',
                  } as any,
                ] as any
              }
            />
            <View
              style={
                [
                  StyleSheet.absoluteFillObject,
                  {
                    backgroundImage: [
                      'radial-gradient(56% 36% at 14% 8%, rgba(109, 40, 217, 0.08) 0%, transparent 72%)',
                      'radial-gradient(52% 34% at 88% 10%, rgba(37, 99, 235, 0.08) 0%, transparent 72%)',
                      'radial-gradient(48% 32% at 84% 86%, rgba(16, 185, 129, 0.075) 0%, transparent 72%)',
                      'radial-gradient(46% 30% at 12% 84%, rgba(225, 29, 72, 0.06) 0%, transparent 72%)',
                      'radial-gradient(42% 28% at 50% 48%, rgba(245, 158, 11, 0.045) 0%, transparent 72%)',
                    ].join(', '),
                  } as any,
                ] as any
              }
            />
          </>
        ) : (
          <>
            <View style={[styles.orb, styles.orbBlue]} />
            <View style={[styles.orb, styles.orbEmerald]} />
            <View style={[styles.orb, styles.orbPurple]} />
          </>
        )}
        <View style={styles.horizonLine} />
      </View>
      <View style={styles.contentLayer} {...(Platform.OS === 'web' ? { dataSet: { publicPortalReady: '1' } } : {})}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: (Platform.OS === 'web' ? '100vh' : undefined) as any,
    backgroundColor: PUBLIC_GLASS_THEME.bgDeep,
    position: 'relative',
  },
  atmosphereLayer: {
    ...(Platform.OS === 'web'
      ? { position: 'fixed' as any, top: 0, right: 0, bottom: 0, left: 0 }
      : StyleSheet.absoluteFillObject),
    zIndex: 0,
    overflow: 'hidden',
  },
  orb: {
    position: 'absolute',
    borderRadius: 999,
  },
  orbBlue: {
    top: -120,
    left: '20%',
    width: 420,
    height: 420,
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
  },
  orbEmerald: {
    top: 40,
    right: -120,
    width: 340,
    height: 340,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
  },
  orbPurple: {
    bottom: -140,
    left: -100,
    width: 380,
    height: 380,
    backgroundColor: 'rgba(109, 40, 217, 0.07)',
  },
  horizonLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 4,
    ...(Platform.OS === 'web'
      ? ({
          backgroundImage:
            'linear-gradient(90deg, #6D28D9 0%, #E11D48 25%, #2563EB 50%, #10B981 75%, #F59E0B 100%)',
        } as any)
      : { backgroundColor: '#2563EB' }),
  },
  contentLayer: {
    flex: 1,
    zIndex: 1,
  },
});
