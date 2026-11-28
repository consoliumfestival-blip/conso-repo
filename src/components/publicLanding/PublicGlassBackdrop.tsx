import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export const PUBLIC_GLASS_THEME = {
  bgDeep: '#050816',
  ink: '#F8FAFC',
  inkMuted: '#9AA8C7',
  glassBg: 'rgba(10, 16, 40, 0.56)',
  glassBgStrong: 'rgba(15, 23, 56, 0.76)',
  glassSurface: 'rgba(20, 26, 52, 0.72)',
  glassBorder: 'rgba(255, 255, 255, 0.14)',
  glassBorderStrong: 'rgba(255, 255, 255, 0.24)',
  blue: '#2563EB',
  blueSoft: 'rgba(37, 99, 235, 0.20)',
  blueBorder: 'rgba(96, 165, 250, 0.35)',
  blueText: '#BFDBFE',
  green: '#10B981',
  greenSoft: 'rgba(16, 185, 129, 0.16)',
  greenBorder: 'rgba(16, 185, 129, 0.36)',
  greenText: '#A7F3D0',
  amber: '#F59E0B',
  amberSoft: 'rgba(245, 158, 11, 0.18)',
  amberBorder: 'rgba(251, 191, 36, 0.42)',
  amberText: '#FDE68A',
  purple: '#6D28D9',
  dangerText: '#FDA4AF',
};

export const webGlassSurface = (blurPx = 18) =>
  Platform.OS === 'web'
    ? ({
        backdropFilter: `blur(${blurPx}px) saturate(1.45)`,
        WebkitBackdropFilter: `blur(${blurPx}px) saturate(1.45)`,
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.16), 0 18px 44px -22px rgba(0, 0, 0, 0.68)',
      } as any)
    : {};

export const webPrimaryGradient = Platform.OS === 'web'
  ? ({ backgroundImage: 'linear-gradient(135deg, #2563EB, #6D28D9)' } as any)
  : {};

export function getPublicRankBadgeStyle(rank: number | null) {
  if (rank === 1) {
    return {
      bg: Platform.OS === 'web'
        ? { backgroundImage: 'linear-gradient(135deg, rgba(245, 158, 11, 0.45), rgba(217, 119, 6, 0.25))' }
        : { backgroundColor: 'rgba(245, 158, 11, 0.28)' },
      borderColor: 'rgba(251, 191, 36, 0.65)',
      textColor: '#FDE68A',
    };
  }
  if (rank === 2) {
    return {
      bg: Platform.OS === 'web'
        ? { backgroundImage: 'linear-gradient(135deg, rgba(96, 165, 250, 0.35), rgba(37, 99, 235, 0.20))' }
        : { backgroundColor: 'rgba(37, 99, 235, 0.25)' },
      borderColor: 'rgba(147, 197, 253, 0.55)',
      textColor: '#DBEAFE',
    };
  }
  if (rank === 3) {
    return {
      bg: Platform.OS === 'web'
        ? { backgroundImage: 'linear-gradient(135deg, rgba(16, 185, 129, 0.32), rgba(5, 150, 105, 0.18))' }
        : { backgroundColor: 'rgba(16, 185, 129, 0.24)' },
      borderColor: 'rgba(110, 231, 183, 0.48)',
      textColor: '#A7F3D0',
    };
  }
  return {
    bg: { backgroundColor: 'rgba(255, 255, 255, 0.10)' },
    borderColor: 'rgba(255, 255, 255, 0.18)',
    textColor: '#FFFFFF',
  };
}

/**
 * Shared Deep Sapphire / Ayatic Codex atmospheric backdrop matching the public Results page.
 */
const BG_COLORS = ['#050816', '#091028', '#0D1636', '#050815'] as const;
const BG_LOCATIONS = [0, 0.42, 0.74, 1] as const;

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
          <View
            style={
              [
                StyleSheet.absoluteFillObject,
                {
                  backgroundImage: [
                    'radial-gradient(62% 40% at 50% 16%, rgba(37, 99, 235, 0.21) 0%, rgba(109, 40, 217, 0.12) 46%, transparent 100%)',
                    'radial-gradient(45% 34% at 10% 12%, rgba(225, 29, 72, 0.12) 0%, transparent 72%)',
                    'radial-gradient(46% 36% at 90% 14%, rgba(16, 185, 129, 0.11) 0%, transparent 72%)',
                    'radial-gradient(50% 34% at 78% 82%, rgba(245, 158, 11, 0.08) 0%, transparent 72%)',
                  ].join(', '),
                } as any,
              ] as any
            }
          />
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
    backgroundColor: 'rgba(37, 99, 235, 0.18)',
  },
  orbEmerald: {
    top: 40,
    right: -120,
    width: 340,
    height: 340,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
  },
  orbPurple: {
    bottom: -140,
    left: -100,
    width: 380,
    height: 380,
    backgroundColor: 'rgba(109, 40, 217, 0.14)',
  },
  horizonLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '56%',
    height: 1,
    ...(Platform.OS === 'web'
      ? ({
          backgroundImage:
            'linear-gradient(90deg, transparent 0%, rgba(109, 40, 217, 0.34) 20%, rgba(96, 165, 250, 0.45) 50%, rgba(245, 158, 11, 0.32) 80%, transparent 100%)',
        } as any)
      : { backgroundColor: 'rgba(96, 165, 250, 0.18)' }),
  },
  contentLayer: {
    flex: 1,
    zIndex: 1,
  },
});
