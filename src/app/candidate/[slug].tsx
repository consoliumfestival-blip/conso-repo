import React, { useMemo } from 'react';
import Head from 'expo-router/head';
import {
  ActivityIndicator,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowLeft,
  Award,
  BookOpen,
  Building2,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserRound,
} from 'lucide-react-native';
import { usePublicCandidateProfile } from '../../core/hooks/useParticipants';
import {
  getPublicRankBadgeStyle,
  PUBLIC_GLASS_THEME,
  PublicGlassBackdrop,
  webGlassSurface,
  webPrimaryGradient,
} from '../../components/publicLanding/PublicGlassBackdrop';

const nativeFont = (fontFamily: string) => (Platform.OS === 'web' ? {} : { fontFamily });

const formatDate = (value: string | null) => {
  if (!value) return 'Published';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
};

export default function PublicCandidateProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const { width } = useWindowDimensions();
  const isDesktop = (width || 0) >= 1024;
  const isTablet = (width || 0) >= 640;
  const isMobile = (width || 0) < 640;

  const profileQuery = usePublicCandidateProfile(slug);
  const candidate = profileQuery.data;

  const stats = useMemo(() => {
    const results = candidate?.published_results ?? [];
    return [
      {
        id: 'items',
        label: 'Participated Items',
        value: `${candidate?.participated_items.length ?? 0}`,
        icon: BookOpen,
        tone: PUBLIC_GLASS_THEME.green,
        bg: PUBLIC_GLASS_THEME.greenSoft,
        border: PUBLIC_GLASS_THEME.greenBorder,
      },
      {
        id: 'results',
        label: 'Published Results',
        value: `${results.length}`,
        icon: ShieldCheck,
        tone: PUBLIC_GLASS_THEME.blueText,
        bg: PUBLIC_GLASS_THEME.blueSoft,
        border: PUBLIC_GLASS_THEME.blueBorder,
      },
      {
        id: 'wins',
        label: 'First Places',
        value: `${results.filter((result) => result.rank === 1).length}`,
        icon: Trophy,
        tone: PUBLIC_GLASS_THEME.amberText,
        bg: PUBLIC_GLASS_THEME.amberSoft,
        border: PUBLIC_GLASS_THEME.amberBorder,
      },
      /* Hidden for now - to be published after Sahithyolsav
      {
        id: 'points',
        label: 'Public Points',
        value: `${results.reduce((sum, result) => sum + (result.points_awarded || 0), 0)}`,
        icon: Medal,
        tone: PUBLIC_GLASS_THEME.amberText,
        bg: PUBLIC_GLASS_THEME.amberSoft,
        border: PUBLIC_GLASS_THEME.amberBorder,
      },
      */
    ];
  }, [candidate]);

  if (profileQuery.isLoading) {
    return (
      <PublicGlassBackdrop>
        <Head>
          <title>Candidate Profile · Consoulium 2k26</title>
        </Head>
        <View style={styles.gradientBgCenter}>
          <View style={[styles.stateCard, webGlassSurface(18)]}>
            <ActivityIndicator color={PUBLIC_GLASS_THEME.green} size="large" />
            <Text style={styles.centerText}>Loading candidate profile...</Text>
          </View>
        </View>
      </PublicGlassBackdrop>
    );
  }

  if (profileQuery.error || !candidate?.profile) {
    return (
      <PublicGlassBackdrop>
        <Head>
          <title>Profile Not Available · Consoulium 2k26</title>
        </Head>
        <View style={styles.gradientBgCenter}>
          <View style={[styles.stateCard, webGlassSurface(18), styles.emptyStateCard]}>
            <View style={styles.emptyIcon}>
              <UserRound size={30} color={PUBLIC_GLASS_THEME.blueText} />
            </View>
            <Text style={styles.emptyTitle}>Profile not available</Text>
            <Text style={styles.emptyMessage}>
              This candidate profile may be disabled or not published for public viewing.
            </Text>
            <TouchableOpacity onPress={() => router.back()} style={[styles.backButton, webPrimaryGradient]}>
              <ArrowLeft size={16} color="#FFFFFF" />
              <Text style={styles.backButtonText}>Go back</Text>
            </TouchableOpacity>
          </View>
        </View>
      </PublicGlassBackdrop>
    );
  }

  const { profile, participated_items, published_results } = candidate;
  const avatarInitials = (profile.name || 'Candidate')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase();

  return (
    <PublicGlassBackdrop>
      <Head>
        <title>{profile.name} · Consoulium 2k26</title>
      </Head>
      <ScrollView
        showsVerticalScrollIndicator={false}
        className="no-scrollbar"
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          isDesktop && styles.contentDesktop,
          isMobile && styles.contentMobile,
        ]}
      >
        <View style={styles.topNavRow}>
          <TouchableOpacity onPress={() => router.back()} style={[styles.topBack, webGlassSurface(16)]}>
            <ArrowLeft size={16} color={PUBLIC_GLASS_THEME.ink} />
            <Text style={styles.topBackText}>Back to Portal</Text>
          </TouchableOpacity>
          <View style={[styles.brandPill, webGlassSurface(16)]}>
            <Image source={require('@/assets/images/consolium-crest.png')} resizeMode="contain" accessibilityLabel="Consolium logo" style={styles.brandLogo} />
            <Text style={styles.brandLabel}>CONSOULIUM 2K26</Text>
          </View>
        </View>

        <View style={[styles.hero, webGlassSurface(20), isDesktop && styles.heroDesktop]}>
          <View style={[styles.avatar, isMobile && styles.avatarMobile]}>
            <Text style={[styles.avatarInitials, isMobile && styles.avatarInitialsMobile]}>
              {avatarInitials}
            </Text>
          </View>
          <View style={styles.heroMain}>
            <View style={styles.publicPill}>
              <Sparkles size={13} color={PUBLIC_GLASS_THEME.greenText} />
              <Text style={styles.publicPillText}>Public Candidate Profile</Text>
            </View>
            <Text style={[styles.name, isMobile && styles.nameMobile]}>{profile.name}</Text>
            <View style={styles.metaRow}>
              {profile.category_code ? (
                <View style={styles.metaPill}>
                  <Award size={14} color={PUBLIC_GLASS_THEME.blueText} />
                  <Text style={styles.metaPillText}>{profile.category_code}</Text>
                </View>
              ) : null}
              {profile.organisation_name ? (
                <View style={styles.metaPillUnit}>
                  <Building2 size={14} color={PUBLIC_GLASS_THEME.amberText} />
                  <Text style={styles.metaPillUnitText} numberOfLines={1}>
                    {profile.organisation_name}
                  </Text>
                </View>
              ) : null}
            </View>
            {profile.bio ? (
              <Text style={styles.bio}>{profile.bio}</Text>
            ) : (
              <Text style={styles.bioMuted}>Candidate bio has not been added yet.</Text>
            )}
          </View>
        </View>

        <View style={isTablet ? styles.statsGrid : styles.statsStackMobile}>
          {isTablet ? (
            stats.map((stat) => {
              const Icon = stat.icon;
              return (
                <View key={stat.id} style={[styles.statCard, styles.statCardDesktop, webGlassSurface(18)]}>
                  <View style={styles.statTop}>
                    <View style={[styles.statIcon, { backgroundColor: stat.bg, borderColor: stat.border }]}>
                      <Icon size={19} color={stat.tone} />
                    </View>
                    <Text style={styles.statValue}>{stat.value}</Text>
                  </View>
                  <Text style={styles.statLabel}>{stat.label}</Text>
                </View>
              );
            })
          ) : (
            <>
              <View style={styles.statsRowMobile}>
                {stats.slice(0, 2).map((stat) => {
                  const Icon = stat.icon;
                  return (
                    <View key={stat.id} style={[styles.statCard, styles.statCardMobileHalf, webGlassSurface(18)]}>
                      <View style={styles.statTop}>
                        <View style={[styles.statIcon, { backgroundColor: stat.bg, borderColor: stat.border }]}>
                          <Icon size={18} color={stat.tone} />
                        </View>
                        <Text style={styles.statValue}>{stat.value}</Text>
                      </View>
                      <Text style={styles.statLabel} numberOfLines={2}>{stat.label}</Text>
                    </View>
                  );
                })}
              </View>
              {stats.slice(2).map((stat) => {
                const Icon = stat.icon;
                return (
                  <View key={stat.id} style={[styles.statCard, styles.statCardMobileFull, webGlassSurface(18)]}>
                    <View style={styles.statTop}>
                      <View style={[styles.statIcon, { backgroundColor: stat.bg, borderColor: stat.border }]}>
                        <Icon size={18} color={stat.tone} />
                      </View>
                      <Text style={styles.statValue}>{stat.value}</Text>
                    </View>
                    <Text style={styles.statLabel}>{stat.label}</Text>
                  </View>
                );
              })}
            </>
          )}
        </View>

        <View style={[styles.sections, isDesktop && styles.sectionsDesktop]}>
          <View style={[styles.sectionCard, webGlassSurface(18), isDesktop ? { flex: 1 } : styles.sectionCardFull]}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Participated Items</Text>
              <View style={styles.sectionCountPill}>
                <Text style={styles.sectionCountText}>{participated_items.length}</Text>
              </View>
            </View>
            {participated_items.length === 0 ? (
              <Text style={styles.emptySectionText}>No public participation entries are available.</Text>
            ) : (
              participated_items.map((item, idx) => (
                <View
                  key={item.registration_id}
                  style={[styles.itemRow, idx === 0 && styles.rowFirst]}
                >
                  <View style={[styles.itemIcon, { backgroundColor: PUBLIC_GLASS_THEME.greenSoft, borderColor: PUBLIC_GLASS_THEME.greenBorder }]}>
                    <BookOpen size={16} color={PUBLIC_GLASS_THEME.greenText} />
                  </View>
                  <View style={styles.itemMain}>
                    <Text style={styles.itemName} numberOfLines={2}>
                      {item.item_name_ml || item.item_name}
                    </Text>
                    <Text style={styles.itemMeta}>
                      {item.entry_kind === 'general_team'
                        ? `General group · Chest ${item.entry_chest_number || '—'} · Team points only`
                        : `${(item.category_codes || []).join(' / ') || 'General'} · ${item.participation_type}`}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>

          <View style={[styles.sectionCard, webGlassSurface(18), isDesktop ? { flex: 1 } : styles.sectionCardFull]}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Published Results</Text>
              <View style={styles.sectionCountPill}>
                <Text style={styles.sectionCountText}>{published_results.length}</Text>
              </View>
            </View>
            {published_results.length === 0 ? (
              <Text style={styles.emptySectionText}>No public-visible results are published yet.</Text>
            ) : (
              published_results.map((result, idx) => {
                const rankVisual = getPublicRankBadgeStyle(result.rank);
                return (
                  <View
                    key={result.result_id}
                    style={[styles.resultRow, idx === 0 && styles.rowFirst]}
                  >
                    <View style={[styles.rankBadge, rankVisual.bg as any, { borderColor: rankVisual.borderColor }]}>
                      <Text style={[styles.rankText, { color: rankVisual.textColor }]}>{result.rank ?? '–'}</Text>
                    </View>
                    <View style={styles.itemMain}>
                      <Text style={styles.itemName} numberOfLines={2}>
                        {result.item_name_ml || result.item_name}
                      </Text>
                      <Text style={styles.itemMeta} numberOfLines={1}>
                        {formatDate(result.published_at)}
                      </Text>
                    </View>
                    {result.grade ? (
                      <View style={styles.gradePill}>
                        <Text style={styles.gradePillText}>Grade {result.grade}</Text>
                      </View>
                    ) : null}
                  </View>
                );
              })
            )}
          </View>
        </View>
      </ScrollView>
    </PublicGlassBackdrop>
  );
}

const styles = StyleSheet.create({
  gradientBgCenter: {
    flex: 1,
    minHeight: (Platform.OS === 'web' ? '100vh' : undefined) as any,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  stateCard: {
    borderWidth: 1,
    borderColor: PUBLIC_GLASS_THEME.glassBorder,
    borderRadius: 24,
    backgroundColor: PUBLIC_GLASS_THEME.glassBg,
    paddingHorizontal: 28,
    paddingVertical: 26,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyStateCard: {
    width: '100%',
    maxWidth: 420,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 56,
    maxWidth: 1100,
    width: '100%',
    alignSelf: 'center',
  },
  contentDesktop: {
    padding: 32,
    paddingBottom: 64,
  },
  contentMobile: {
    padding: 16,
    paddingBottom: 40,
  },
  centerText: {
    ...nativeFont('Outfit_400Regular'),
    color: PUBLIC_GLASS_THEME.inkMuted,
    fontSize: 13.5,
  },
  emptyIcon: {
    width: 68,
    height: 68,
    borderRadius: 24,
    backgroundColor: PUBLIC_GLASS_THEME.blueSoft,
    borderWidth: 1,
    borderColor: PUBLIC_GLASS_THEME.blueBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    ...nativeFont('Outfit_700Bold'),
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyMessage: {
    ...nativeFont('Outfit_400Regular'),
    color: PUBLIC_GLASS_THEME.inkMuted,
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 360,
  },
  backButton: {
    height: 42,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(147, 197, 253, 0.45)',
    backgroundColor: PUBLIC_GLASS_THEME.blue,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  backButtonText: {
    ...nativeFont('Outfit_700Bold'),
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
  },
  topNavRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 20,
  },
  topBack: {
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
    backgroundColor: PUBLIC_GLASS_THEME.glassBg,
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  topBackText: {
    ...nativeFont('Outfit_700Bold'),
    color: PUBLIC_GLASS_THEME.ink,
    fontSize: 13.5,
    fontWeight: '600',
  },
  brandPill: {
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: PUBLIC_GLASS_THEME.glassBorder,
    backgroundColor: PUBLIC_GLASS_THEME.glassBg,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandLogo: {
    width: 22,
    height: 22,
  },
  brandLabel: {
    color: PUBLIC_GLASS_THEME.ink,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  hero: {
    borderWidth: 1,
    borderColor: PUBLIC_GLASS_THEME.glassBorder,
    borderRadius: 26,
    backgroundColor: PUBLIC_GLASS_THEME.glassBg,
    padding: 22,
    gap: 20,
  },
  heroDesktop: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 30,
    gap: 26,
  },
  avatar: {
    width: 118,
    height: 118,
    borderRadius: 59,
    borderWidth: 2,
    borderColor: 'rgba(96, 165, 250, 0.55)',
    backgroundColor: 'rgba(37, 99, 235, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? { boxShadow: '0 0 32px rgba(37, 99, 235, 0.28)' } as any : {}),
  },
  avatarMobile: {
    width: 92,
    height: 92,
    borderRadius: 46,
  },
  avatarInitials: {
    ...nativeFont('Outfit_700Bold'),
    color: '#DBEAFE',
    fontSize: 38,
    fontWeight: '800',
    letterSpacing: 1,
  },
  avatarInitialsMobile: {
    fontSize: 30,
  },
  heroMain: {
    flex: 1,
    minWidth: 0,
  },
  publicPill: {
    alignSelf: 'flex-start',
    height: 28,
    borderRadius: 999,
    backgroundColor: PUBLIC_GLASS_THEME.greenSoft,
    borderWidth: 1,
    borderColor: PUBLIC_GLASS_THEME.greenBorder,
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  publicPillText: {
    ...nativeFont('Outfit_700Bold'),
    color: PUBLIC_GLASS_THEME.greenText,
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  name: {
    ...nativeFont('Outfit_700Bold'),
    color: '#FFFFFF',
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '700',
    letterSpacing: -0.7,
  },
  nameMobile: {
    fontSize: 27,
    lineHeight: 33,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  metaPill: {
    height: 30,
    borderRadius: 999,
    backgroundColor: PUBLIC_GLASS_THEME.blueSoft,
    borderWidth: 1,
    borderColor: PUBLIC_GLASS_THEME.blueBorder,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaPillText: {
    ...nativeFont('Outfit_700Bold'),
    color: PUBLIC_GLASS_THEME.blueText,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  metaPillUnit: {
    height: 30,
    borderRadius: 999,
    backgroundColor: PUBLIC_GLASS_THEME.amberSoft,
    borderWidth: 1,
    borderColor: PUBLIC_GLASS_THEME.amberBorder,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
  },
  metaPillUnitText: {
    ...nativeFont('Outfit_700Bold'),
    color: PUBLIC_GLASS_THEME.amberText,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    flexShrink: 1,
  },
  bio: {
    ...nativeFont('Outfit_400Regular'),
    color: '#E2E8F0',
    fontSize: 14.5,
    lineHeight: 22,
    marginTop: 14,
    maxWidth: 760,
  },
  bioMuted: {
    ...nativeFont('Outfit_400Regular'),
    color: PUBLIC_GLASS_THEME.inkMuted,
    fontSize: 13.5,
    lineHeight: 20,
    marginTop: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 18,
  },
  statsStackMobile: {
    gap: 10,
    marginTop: 16,
  },
  statsRowMobile: {
    flexDirection: 'row',
    gap: 10,
  },
  statCard: {
    borderWidth: 1,
    borderColor: PUBLIC_GLASS_THEME.glassBorder,
    borderRadius: 22,
    backgroundColor: PUBLIC_GLASS_THEME.glassBg,
    padding: 18,
    justifyContent: 'space-between',
    gap: 10,
  },
  statCardDesktop: {
    flex: 1,
    minWidth: 0,
    minHeight: 104,
  },
  statCardMobileHalf: {
    flex: 1,
    minWidth: 0,
    minHeight: 94,
    padding: 15,
  },
  statCardMobileFull: {
    width: '100%',
    minHeight: 84,
    padding: 15,
  },
  statTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  statIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    ...nativeFont('Outfit_700Bold'),
    color: '#FFFFFF',
    fontSize: 26,
    lineHeight: 30,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    ...nativeFont('Outfit_400Regular'),
    color: PUBLIC_GLASS_THEME.inkMuted,
    fontSize: 12.5,
    fontWeight: '600',
  },
  sections: {
    gap: 18,
    marginTop: 18,
  },
  sectionsDesktop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  sectionCard: {
    borderWidth: 1,
    borderColor: PUBLIC_GLASS_THEME.glassBorder,
    borderRadius: 24,
    backgroundColor: PUBLIC_GLASS_THEME.glassBg,
    padding: 20,
    overflow: 'hidden',
  },
  sectionCardFull: {
    width: '100%',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.10)',
  },
  sectionTitle: {
    ...nativeFont('Outfit_700Bold'),
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  sectionCountPill: {
    paddingHorizontal: 11,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: PUBLIC_GLASS_THEME.glassBorder,
  },
  sectionCountText: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  emptySectionText: {
    ...nativeFont('Outfit_400Regular'),
    color: PUBLIC_GLASS_THEME.inkMuted,
    fontSize: 13.5,
    paddingTop: 16,
    paddingBottom: 6,
    lineHeight: 20,
  },
  itemRow: {
    minHeight: 62,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.09)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  rowFirst: {
    borderTopWidth: 0,
    paddingTop: 14,
  },
  itemIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemMain: {
    flex: 1,
    minWidth: 0,
  },
  itemName: {
    ...nativeFont('Outfit_700Bold'),
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '700',
  },
  itemMeta: {
    ...nativeFont('Outfit_400Regular'),
    color: PUBLIC_GLASS_THEME.inkMuted,
    fontSize: 12.5,
    marginTop: 3,
  },
  resultRow: {
    minHeight: 66,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.09)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  rankBadge: {
    width: 36,
    height: 36,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    ...nativeFont('Outfit_700Bold'),
    fontSize: 13.5,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  gradePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(7, 11, 24, 0.68)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  gradePillText: {
    color: '#FFE082',
    fontSize: 11.5,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
