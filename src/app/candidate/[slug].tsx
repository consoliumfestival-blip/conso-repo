import React, { useEffect, useMemo, useState } from 'react';
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
  LogOut,
  Medal,
  ShieldCheck,
  Trophy,
  UserRound,
} from 'lucide-react-native';
import { usePublicCandidateProfile } from '../../core/hooks/useParticipants';
import {
  FestivalAccentBar,
  getPublicRankBadgeStyle,
  PUBLIC_GLASS_THEME,
  PublicGlassBackdrop,
  webGlassSurface,
  webPrimaryGradient,
} from '../../components/publicLanding/PublicGlassBackdrop';
import {
  DEFAULT_PUBLIC_TENANT_ID,
  LEGACY_PUBLIC_TENANT_ALIAS,
  PublicFestivalMenu,
  navigateBackFromCandidateProfile,
} from '../../components/publicLanding/PublicFestivalMenu';
import { CandidateAppBanner, CandidateStandaloneLogin } from '../../components/publicLanding/CandidateAppControls';
import {
  clearPinnedCandidate,
  disableCandidatePushNotifications,
  isCandidateLoggedOut,
  isCandidateStandaloneMode,
  readPinnedCandidate,
  updateCandidateManifestMetadata,
  writePinnedCandidate,
} from '../../core/utils/candidateWebPush';

const nativeFont = (fontFamily: string) => ({ fontFamily });

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
  const routeTenant = Array.isArray(params.tenant_id) ? params.tenant_id[0] : params.tenant_id;
  const festivalId = Array.isArray(params.festival_id) ? params.festival_id[0] : params.festival_id;
  const installedPortalParam = Array.isArray(params.installedPortal)
    ? params.installedPortal[0]
    : params.installedPortal;
  const effectiveTenantId =
    routeTenant && routeTenant !== LEGACY_PUBLIC_TENANT_ALIAS
      ? routeTenant
      : DEFAULT_PUBLIC_TENANT_ID;
  const isStandalone = isCandidateStandaloneMode(installedPortalParam);
  const [loggedOutInApp, setLoggedOutInApp] = useState(() => isStandalone && isCandidateLoggedOut());
  const { width } = useWindowDimensions();
  const isDesktop = (width || 0) >= 1024;
  const isTablet = (width || 0) >= 640;
  const isMobile = (width || 0) < 640;

  const handleBack = () =>
    navigateBackFromCandidateProfile(router, {
      tenantId: routeTenant,
      festivalId,
    });

  const handleLogout = () => {
    void disableCandidatePushNotifications();
    clearPinnedCandidate();
    setLoggedOutInApp(true);
  };

  const handleSwitchCandidate = (nextSlug: string, nextName: string) => {
    writePinnedCandidate({
      slug: nextSlug,
      name: nextName,
      tenant_id: routeTenant || null,
      festival_id: festivalId || null,
    });
    setLoggedOutInApp(false);
    router.replace({
      pathname: '/candidate/[slug]',
      params: {
        slug: nextSlug,
        installedPortal: 'candidate',
        ...(routeTenant ? { tenant_id: routeTenant } : {}),
        ...(festivalId ? { festival_id: festivalId } : {}),
      },
    } as any);
  };

  const profileQuery = usePublicCandidateProfile(slug);
  const candidate = profileQuery.data;

  useEffect(() => {
    if (!slug) return;
    updateCandidateManifestMetadata({
      slug,
      name: candidate?.profile?.name || null,
      tenantId: routeTenant || null,
      festivalId: festivalId || null,
    });
    if (candidate?.profile && !isCandidateLoggedOut()) {
      writePinnedCandidate({
        slug: candidate.profile.slug,
        name: candidate.profile.name,
        tenant_id: routeTenant || null,
        festival_id: festivalId || null,
      });
    }
  }, [slug, candidate?.profile, routeTenant, festivalId]);

  useEffect(() => {
    if (!isStandalone || loggedOutInApp) return;
    const pinned = readPinnedCandidate();
    if (pinned && pinned.slug && pinned.slug !== slug) {
      router.replace({
        pathname: '/candidate/[slug]',
        params: {
          slug: pinned.slug,
          installedPortal: 'candidate',
          ...(pinned.tenant_id ? { tenant_id: pinned.tenant_id } : {}),
          ...(pinned.festival_id ? { festival_id: pinned.festival_id } : {}),
        },
      } as any);
      return;
    }
    if (!pinned && candidate?.profile) {
      writePinnedCandidate({
        slug: candidate.profile.slug,
        name: candidate.profile.name,
        tenant_id: routeTenant || null,
        festival_id: festivalId || null,
      });
    }
  }, [isStandalone, loggedOutInApp, slug, candidate?.profile, routeTenant, festivalId, router]);

  const stats = useMemo(() => {
    const results = candidate?.published_results ?? [];
    return [
      {
        id: 'items',
        label: 'Participated Items',
        value: `${candidate?.participated_items.length ?? 0}`,
        icon: BookOpen,
        tone: PUBLIC_GLASS_THEME.greenText,
        bg: PUBLIC_GLASS_THEME.greenSoft,
        border: PUBLIC_GLASS_THEME.greenBorder,
        cardGradient: 'linear-gradient(135deg, rgba(16, 185, 129, 0.13), rgba(255, 255, 255, 0.80))',
      },
      {
        id: 'results',
        label: 'Published Results',
        value: `${results.length}`,
        icon: ShieldCheck,
        tone: PUBLIC_GLASS_THEME.blueText,
        bg: PUBLIC_GLASS_THEME.blueSoft,
        border: PUBLIC_GLASS_THEME.blueBorder,
        cardGradient: 'linear-gradient(135deg, rgba(37, 99, 235, 0.13), rgba(255, 255, 255, 0.80))',
      },
      {
        id: 'first',
        label: '1st Place',
        value: `${results.filter((result) => result.rank === 1).length}`,
        icon: Trophy,
        tone: '#B45309',
        bg: 'rgba(245, 158, 11, 0.15)',
        border: 'rgba(245, 158, 11, 0.42)',
        cardGradient: 'linear-gradient(135deg, #FEF3C7, rgba(255, 255, 255, 0.84))',
      },
      {
        id: 'second',
        label: '2nd Place',
        value: `${results.filter((result) => result.rank === 2).length}`,
        icon: Medal,
        tone: '#475569',
        bg: 'rgba(148, 163, 184, 0.20)',
        border: 'rgba(100, 116, 139, 0.36)',
        cardGradient: 'linear-gradient(135deg, #E2E8F0, rgba(255, 255, 255, 0.86))',
      },
      {
        id: 'third',
        label: '3rd Place',
        value: `${results.filter((result) => result.rank === 3).length}`,
        icon: Award,
        tone: '#C2410C',
        bg: 'rgba(234, 88, 12, 0.14)',
        border: 'rgba(234, 88, 12, 0.34)',
        cardGradient: 'linear-gradient(135deg, #FFEDD5, rgba(255, 255, 255, 0.84))',
      },
    ];
  }, [candidate]);

  if (isStandalone && loggedOutInApp) {
    return (
      <CandidateStandaloneLogin
        tenantId={effectiveTenantId}
        festivalId={festivalId}
        onSelectCandidate={handleSwitchCandidate}
      />
    );
  }

  if (profileQuery.isLoading) {
    return (
      <PublicGlassBackdrop>
        <Head>
          <title>Candidate Profile · Consoulium 2k26</title>
        </Head>
        <View style={styles.gradientBgCenter}>
          <View style={[styles.stateCard, webGlassSurface(18), { minWidth: 280 }]}>
            <FestivalAccentBar height={5} />
            <View style={styles.stateCardBody}>
              <ActivityIndicator color={PUBLIC_GLASS_THEME.blue} size="large" />
              <Text style={styles.centerText}>Loading candidate profile...</Text>
            </View>
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
            <FestivalAccentBar height={5} />
            <View style={styles.stateCardBody}>
              <View style={styles.emptyIcon}>
                <UserRound size={30} color={PUBLIC_GLASS_THEME.blue} />
              </View>
              <Text style={styles.emptyTitle}>Profile not available</Text>
              <Text style={styles.emptyMessage}>
                This candidate profile may be disabled or not published for public viewing.
              </Text>
              {isStandalone ? (
                <TouchableOpacity onPress={handleLogout} style={[styles.backButton, webPrimaryGradient]}>
                  <LogOut size={16} color="#FFFFFF" />
                  <Text style={styles.backButtonText}>Log out</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={handleBack} style={[styles.backButton, webPrimaryGradient]}>
                  <ArrowLeft size={16} color="#FFFFFF" />
                  <Text style={styles.backButtonText}>Go back</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
        {!isStandalone ? (
          <PublicFestivalMenu currentId="candidate-profile" tenantId={routeTenant} festivalId={festivalId} />
        ) : null}
      </PublicGlassBackdrop>
    );
  }

  const { profile, participated_items, published_results } = candidate;

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
          {isStandalone ? (
            <View style={[styles.brandPill, webGlassSurface(16)]}>
              <Image source={require('@/assets/images/consolium-crest.png')} resizeMode="contain" accessibilityLabel="Consolium logo" style={styles.brandLogo} />
              <Text style={styles.brandLabel}>CONSOULIUM 2K26</Text>
            </View>
          ) : (
            <TouchableOpacity onPress={handleBack} style={[styles.topBack, webGlassSurface(16)]}>
              <ArrowLeft size={16} color={PUBLIC_GLASS_THEME.ink} />
              <Text style={styles.topBackText}>Back to Portal</Text>
            </TouchableOpacity>
          )}
          {isStandalone ? (
            <TouchableOpacity onPress={handleLogout} style={[styles.logoutButton, webGlassSurface(16)]}>
              <LogOut size={15} color={PUBLIC_GLASS_THEME.redText} />
              <Text style={styles.logoutButtonText}>Log out</Text>
            </TouchableOpacity>
          ) : (
            <View style={[styles.brandPill, webGlassSurface(16)]}>
              <Image source={require('@/assets/images/consolium-crest.png')} resizeMode="contain" accessibilityLabel="Consolium logo" style={styles.brandLogo} />
              <Text style={styles.brandLabel}>CONSOULIUM 2K26</Text>
            </View>
          )}
        </View>

        <View style={[styles.hero, webGlassSurface(20)]}>
          <FestivalAccentBar height={4} />
          <View style={[styles.heroBody, isDesktop && styles.heroBodyDesktop]}>
            <View style={styles.heroMain}>
              <Text style={[styles.name, isMobile && styles.nameMobile]}>{profile.name}</Text>
              {profile.category_code || profile.organisation_name ? (
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
              ) : null}
              {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
            </View>
          </View>
        </View>

        <CandidateAppBanner
          slug={slug || profile.slug}
          candidateName={profile.name}
          tenantId={effectiveTenantId}
          festivalId={festivalId}
          isStandalone={isStandalone}
        />

        <View style={isDesktop ? styles.statsGrid : styles.statsStackMobile}>
          {isDesktop ? (
            stats.map((stat) => {
              const Icon = stat.icon;
              return (
                <View
                  key={stat.id}
                  style={[
                    styles.statCard,
                    styles.statCardDesktop,
                    webGlassSurface(18),
                    {
                      backgroundColor: stat.bg,
                      borderColor: stat.border,
                      ...(Platform.OS === 'web' ? { backgroundImage: stat.cardGradient } as any : {}),
                    },
                  ]}
                >
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
                    <View
                      key={stat.id}
                      style={[
                        styles.statCard,
                        styles.statCardMobileHalf,
                        webGlassSurface(18),
                        {
                          backgroundColor: stat.bg,
                          borderColor: stat.border,
                          ...(Platform.OS === 'web' ? { backgroundImage: stat.cardGradient } as any : {}),
                        },
                      ]}
                    >
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
              <View style={styles.statsRowMobile}>
                {stats.slice(2).map((stat) => {
                  const Icon = stat.icon;
                  return (
                    <View
                      key={stat.id}
                      style={[
                        styles.statCard,
                        styles.statCardMobileThird,
                        webGlassSurface(18),
                        {
                          backgroundColor: stat.bg,
                          borderColor: stat.border,
                          ...(Platform.OS === 'web' ? { backgroundImage: stat.cardGradient } as any : {}),
                        },
                      ]}
                    >
                      <View style={styles.statTop}>
                        <View style={[styles.statIcon, styles.statIconSmall, { backgroundColor: stat.bg, borderColor: stat.border }]}>
                          <Icon size={16} color={stat.tone} />
                        </View>
                        <Text style={[styles.statValue, styles.statValueSmall]}>{stat.value}</Text>
                      </View>
                      <Text style={styles.statLabel} numberOfLines={1}>{stat.label}</Text>
                    </View>
                  );
                })}
              </View>
            </>
          )}
        </View>

        <View style={[styles.sections, isDesktop && styles.sectionsDesktop]}>
          <View style={[styles.sectionCard, styles.sectionCardGreen, webGlassSurface(18), isDesktop ? { flex: 1 } : styles.sectionCardFull]}>
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

          <View style={[styles.sectionCard, styles.sectionCardPurple, webGlassSurface(18), isDesktop ? { flex: 1 } : styles.sectionCardFull]}>
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
      {!isStandalone ? (
        <PublicFestivalMenu currentId="candidate-profile" tenantId={routeTenant} festivalId={festivalId} />
      ) : null}
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
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: PUBLIC_GLASS_THEME.glassBorderStrong,
    borderRadius: 24,
    backgroundColor: PUBLIC_GLASS_THEME.glassBgStrong,
  },
  stateCardBody: {
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
    paddingTop: 26,
    paddingBottom: 96,
    maxWidth: 1100,
    width: '100%',
    alignSelf: 'center',
  },
  contentDesktop: {
    padding: 32,
    paddingTop: 32,
    paddingBottom: 96,
  },
  contentMobile: {
    padding: 16,
    paddingTop: 24,
    paddingBottom: 96,
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
    color: PUBLIC_GLASS_THEME.ink,
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
    height: 44,
    borderRadius: 999,
    backgroundColor: PUBLIC_GLASS_THEME.ink,
    paddingHorizontal: 22,
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
    borderColor: PUBLIC_GLASS_THEME.glassBorderStrong,
    backgroundColor: PUBLIC_GLASS_THEME.glassBgStrong,
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
  logoutButton: {
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: PUBLIC_GLASS_THEME.redBorder,
    backgroundColor: PUBLIC_GLASS_THEME.redSoft,
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  logoutButtonText: {
    ...nativeFont('Outfit_700Bold'),
    color: PUBLIC_GLASS_THEME.redText,
    fontSize: 13.5,
    fontWeight: '700',
  },
  brandPill: {
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: PUBLIC_GLASS_THEME.glassBorderStrong,
    backgroundColor: PUBLIC_GLASS_THEME.glassBgStrong,
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
    ...nativeFont('Outfit_700Bold'),
    color: PUBLIC_GLASS_THEME.ink,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  hero: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: PUBLIC_GLASS_THEME.blueBorder,
    borderRadius: 22,
    backgroundColor: PUBLIC_GLASS_THEME.blueSoft,
    ...(Platform.OS === 'web'
      ? { backgroundImage: 'linear-gradient(135deg, rgba(37, 99, 235, 0.11), rgba(109, 40, 217, 0.07), rgba(255, 255, 255, 0.84))' } as any
      : {}),
  },
  heroBody: {
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  heroBodyDesktop: {
    paddingHorizontal: 24,
    paddingVertical: 18,
  },
  heroMain: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    ...nativeFont('Outfit_700Bold'),
    color: PUBLIC_GLASS_THEME.ink,
    fontSize: 28,
    lineHeight: 33,
    fontWeight: '700',
    letterSpacing: -0.6,
  },
  nameMobile: {
    fontSize: 23,
    lineHeight: 28,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
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
    color: '#334155',
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
    borderColor: PUBLIC_GLASS_THEME.glassBorderStrong,
    borderRadius: 22,
    backgroundColor: PUBLIC_GLASS_THEME.glassBgStrong,
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
  statCardMobileThird: {
    flex: 1,
    minWidth: 0,
    minHeight: 86,
    padding: 12,
  },
  statIconSmall: {
    width: 32,
    height: 32,
    borderRadius: 10,
  },
  statValueSmall: {
    fontSize: 22,
    lineHeight: 26,
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
    color: PUBLIC_GLASS_THEME.ink,
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
    borderColor: PUBLIC_GLASS_THEME.glassBorderStrong,
    borderRadius: 24,
    backgroundColor: PUBLIC_GLASS_THEME.glassBgStrong,
    padding: 20,
    overflow: 'hidden',
  },
  sectionCardGreen: {
    borderColor: PUBLIC_GLASS_THEME.greenBorder,
    backgroundColor: PUBLIC_GLASS_THEME.greenSoft,
    ...(Platform.OS === 'web'
      ? { backgroundImage: 'linear-gradient(155deg, rgba(16, 185, 129, 0.10), rgba(255, 255, 255, 0.84))' } as any
      : {}),
  },
  sectionCardPurple: {
    borderColor: PUBLIC_GLASS_THEME.purpleBorder,
    backgroundColor: PUBLIC_GLASS_THEME.purpleSoft,
    ...(Platform.OS === 'web'
      ? { backgroundImage: 'linear-gradient(155deg, rgba(109, 40, 217, 0.10), rgba(37, 99, 235, 0.06), rgba(255, 255, 255, 0.84))' } as any
      : {}),
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
    borderBottomColor: PUBLIC_GLASS_THEME.hairline,
  },
  sectionTitle: {
    ...nativeFont('Outfit_700Bold'),
    color: PUBLIC_GLASS_THEME.ink,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  sectionCountPill: {
    paddingHorizontal: 11,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: PUBLIC_GLASS_THEME.surfaceSubtle,
    borderWidth: 1,
    borderColor: PUBLIC_GLASS_THEME.glassBorder,
  },
  sectionCountText: {
    ...nativeFont('Outfit_700Bold'),
    color: PUBLIC_GLASS_THEME.ink,
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
    borderTopColor: PUBLIC_GLASS_THEME.hairline,
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
    color: PUBLIC_GLASS_THEME.ink,
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
    borderTopColor: PUBLIC_GLASS_THEME.hairline,
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
    backgroundColor: PUBLIC_GLASS_THEME.purpleSoft,
    borderWidth: 1,
    borderColor: PUBLIC_GLASS_THEME.purpleBorder,
  },
  gradePillText: {
    ...nativeFont('Outfit_700Bold'),
    color: PUBLIC_GLASS_THEME.purpleText,
    fontSize: 11.5,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
