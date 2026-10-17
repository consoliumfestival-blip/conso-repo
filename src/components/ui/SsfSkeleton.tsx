import { ui } from '@/constants/designSystem';
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  DimensionValue,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';

type SkeletonProps = {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: ViewStyle;
};

function useSkeletonPulse() {
  const opacity = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 720,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.55,
          duration: 720,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return opacity;
}

function SkeletonBone({
  opacity,
  width = '100%',
  height = 14,
  radius = 8,
  style,
}: SkeletonProps & { opacity: Animated.Value }) {
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.bone, { width, height, borderRadius: radius, opacity }, style]}
    />
  );
}

export function SsfSkeleton(props: SkeletonProps) {
  const opacity = useSkeletonPulse();
  return <SkeletonBone opacity={opacity} {...props} />;
}

type TableSkeletonProps = {
  rows?: number;
  columns?: number;
  compact?: boolean;
};

export function SsfTableSkeleton({
  rows = 6,
  columns = 4,
  compact = false,
}: TableSkeletonProps) {
  const opacity = useSkeletonPulse();
  const { width } = useWindowDimensions();
  const isCompact = compact || width < 720;

  if (isCompact) {
    return (
      <View style={styles.cardList}>
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <View key={rowIndex} style={styles.listCard}>
            <SkeletonBone opacity={opacity} width={42} height={42} radius={21} />
            <View style={styles.listCopy}>
              <SkeletonBone opacity={opacity} width={rowIndex % 2 ? '68%' : '78%'} height={14} />
              <SkeletonBone opacity={opacity} width={rowIndex % 2 ? '42%' : '54%'} height={11} />
            </View>
            <SkeletonBone opacity={opacity} width={64} height={26} radius={13} />
          </View>
        ))}
      </View>
    );
  }

  return (
    <View style={styles.table}>
      <View style={styles.tableHeader}>
        {Array.from({ length: columns }).map((_, columnIndex) => (
          <View key={columnIndex} style={styles.cell}>
            <SkeletonBone
              opacity={opacity}
              width={columnIndex === 0 ? '72%' : '54%'}
              height={10}
              radius={5}
            />
          </View>
        ))}
      </View>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <View key={rowIndex} style={styles.tableRow}>
          {Array.from({ length: columns }).map((_, columnIndex) => (
            <View key={columnIndex} style={styles.cell}>
              <SkeletonBone
                opacity={opacity}
                width={
                  columnIndex === 0
                    ? rowIndex % 2
                      ? '78%'
                      : '88%'
                    : rowIndex % 3
                      ? '58%'
                      : '70%'
                }
                height={13}
              />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

export function SsfProfileSkeleton() {
  const opacity = useSkeletonPulse();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  if (isMobile) {
    return (
      <ScrollView
        style={styles.mobileProfilePage}
        contentContainerStyle={styles.mobileProfileContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.mobileProfileTopbar}>
          <SkeletonBone opacity={opacity} width={38} height={38} radius={12} />
          <View style={styles.listCopy}>
            <SkeletonBone opacity={opacity} width={116} height={18} radius={7} />
            <SkeletonBone opacity={opacity} width={176} height={9} radius={5} />
          </View>
        </View>

        <View style={styles.mobileHeroSkeleton}>
          <View style={styles.mobileHeroCover} />
          <View style={styles.mobileHeroBody}>
            <View style={styles.mobileProfileIdentity}>
              <SkeletonBone opacity={opacity} width={62} height={62} radius={18} />
              <View style={styles.listCopy}>
                <SkeletonBone opacity={opacity} width="82%" height={18} radius={7} />
                <SkeletonBone opacity={opacity} width="56%" height={10} radius={5} />
                <View style={styles.mobileSkeletonBadges}>
                  <SkeletonBone opacity={opacity} width={44} height={22} radius={7} />
                  <SkeletonBone opacity={opacity} width={72} height={22} radius={7} />
                </View>
              </View>
            </View>
            <SkeletonBone opacity={opacity} width="100%" height={38} radius={9} />
            <View style={styles.mobileSkeletonActions}>
              <SkeletonBone opacity={opacity} width="48%" height={42} radius={10} />
              <SkeletonBone opacity={opacity} width="48%" height={42} radius={10} />
            </View>
          </View>
        </View>

        <View style={styles.mobileSkeletonStack}>
          {Array.from({ length: 3 }).map((_, index) => (
            <View key={index} style={styles.mobileSkeletonRow}>
              <SkeletonBone opacity={opacity} width={34} height={34} radius={9} />
              <View style={styles.listCopy}>
                <SkeletonBone opacity={opacity} width={index === 1 ? '58%' : '48%'} height={12} radius={6} />
                <SkeletonBone opacity={opacity} width={index === 1 ? '72%' : '62%'} height={9} radius={5} />
              </View>
              <SkeletonBone opacity={opacity} width={18} height={18} radius={9} />
            </View>
          ))}
        </View>

        {Array.from({ length: 2 }).map((_, index) => (
          <View key={index} style={styles.mobileSummarySkeleton}>
            <SkeletonBone opacity={opacity} width={42} height={42} radius={11} />
            <View style={styles.listCopy}>
              <SkeletonBone opacity={opacity} width={index ? '54%' : '68%'} height={14} radius={6} />
              <SkeletonBone opacity={opacity} width={index ? '36%' : '76%'} height={9} radius={5} />
            </View>
            <SkeletonBone opacity={opacity} width={54} height={30} radius={9} />
          </View>
        ))}
      </ScrollView>
    );
  }

  return (
    <View style={styles.profilePage}>
      <View style={styles.profileHeader}>
        <SkeletonBone opacity={opacity} width={42} height={42} radius={21} />
        <SkeletonBone opacity={opacity} width={140} height={24} radius={8} />
      </View>
      <View style={styles.profileCard}>
        <View style={styles.profileIdentity}>
          <SkeletonBone opacity={opacity} width={72} height={72} radius={36} />
          <View style={styles.listCopy}>
            <SkeletonBone opacity={opacity} width={180} height={20} />
            <SkeletonBone opacity={opacity} width={112} height={13} />
          </View>
        </View>
        <View style={styles.profileGrid}>
          {Array.from({ length: 8 }).map((_, index) => (
            <View key={index} style={styles.profileField}>
              <SkeletonBone opacity={opacity} width={70} height={10} radius={5} />
              <SkeletonBone
                opacity={opacity}
                width={index % 2 ? '62%' : '78%'}
                height={15}
              />
            </View>
          ))}
        </View>
      </View>
      <SsfTableSkeleton rows={4} columns={3} />
    </View>
  );
}

export function SsfDashboardSkeleton() {
  const opacity = useSkeletonPulse();

  return (
    <View style={styles.dashboardPage}>
      <View style={styles.dashboardHeading}>
        <View style={styles.listCopy}>
          <SkeletonBone opacity={opacity} width={190} height={26} />
          <SkeletonBone opacity={opacity} width={260} height={12} />
        </View>
        <SkeletonBone opacity={opacity} width={110} height={38} radius={12} />
      </View>
      <View style={styles.statGrid}>
        {Array.from({ length: 4 }).map((_, index) => (
          <View key={index} style={styles.statCard}>
            <SkeletonBone opacity={opacity} width={42} height={42} radius={13} />
            <SkeletonBone opacity={opacity} width={index % 2 ? '52%' : '64%'} height={11} />
            <SkeletonBone opacity={opacity} width={index % 2 ? '34%' : '42%'} height={25} />
          </View>
        ))}
      </View>
      <SsfTableSkeleton rows={6} columns={4} />
    </View>
  );
}

const styles = StyleSheet.create({
  bone: {
    backgroundColor: '#E5EAF0',
  },
  cardList: {
    gap: 10,
    paddingVertical: 8,
  },
  listCard: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: ui.colors.surface,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
  },
  listCopy: {
    flex: 1,
    gap: 9,
  },
  table: {
    overflow: 'hidden',
    backgroundColor: ui.colors.surface,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
  },
  tableHeader: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  tableRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  cell: {
    flex: 1,
    paddingHorizontal: 16,
  },
  profilePage: {
    flex: 1,
    gap: 18,
    padding: 20,
    backgroundColor: '#F5F7FA',
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  profileCard: {
    gap: 24,
    padding: 20,
    backgroundColor: ui.colors.surface,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
  },
  profileIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  profileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 22,
  },
  profileField: {
    width: '50%',
    gap: 8,
    paddingRight: 16,
  },
  mobileProfilePage: {
    flex: 1,
    backgroundColor: '#F4F7F6',
  },
  mobileProfileContent: {
    gap: 12,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 28,
  },
  mobileProfileTopbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  mobileHeroSkeleton: {
    overflow: 'hidden',
    backgroundColor: ui.colors.surface,
    borderWidth: 1,
    borderColor: '#DDE7E4',
    borderRadius: 10,
  },
  mobileHeroCover: {
    height: 82,
    backgroundColor: '#DDF2ED',
  },
  mobileHeroBody: {
    gap: 12,
    marginTop: -32,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  mobileProfileIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  mobileSkeletonBadges: {
    flexDirection: 'row',
    gap: 7,
  },
  mobileSkeletonActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  mobileSkeletonStack: {
    gap: 8,
  },
  mobileSkeletonRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: ui.colors.surface,
    borderWidth: 1,
    borderColor: '#DDE7E4',
    borderRadius: 10,
  },
  mobileSummarySkeleton: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 13,
    backgroundColor: ui.colors.surface,
    borderWidth: 1,
    borderColor: '#DDE7E4',
    borderRadius: 10,
  },
  dashboardPage: {
    flex: 1,
    gap: 20,
    padding: 22,
    backgroundColor: '#F5F7FA',
  },
  dashboardHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  statCard: {
    flex: 1,
    minWidth: 170,
    gap: 12,
    padding: 18,
    backgroundColor: ui.colors.surface,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
  },
});
