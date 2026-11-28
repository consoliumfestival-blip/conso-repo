import React, { useEffect, useMemo, useRef, useState } from 'react';
import Head from 'expo-router/head';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Image, Platform, ScrollView, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { ArrowLeft, ChevronRight, Search, UserRound, X } from 'lucide-react-native';
import { useAuthStore } from '../../core/store/authStore';
import { useTenantFeatures } from '../../core/hooks/useTenantFeatures';
import { usePublicCandidateSearch } from '../../core/hooks/useParticipants';
import {
  mergeAndSortDualCandidates,
  sortCandidatesByRelevance,
} from '../../core/utils/candidateSearchSort';
import type { PublicCandidateSearchItem } from '../../providers/database/DatabaseProvider';
import { PublicUnavailableScreen } from '../../components/publicLanding/PublicUnavailableScreen';
import { FestivalAccentBar, PUBLIC_GLASS_THEME, PublicGlassBackdrop, webGlassSurface, webPrimaryGradient } from '../../components/publicLanding/PublicGlassBackdrop';
import { PublicFestivalMenu, navigateBackFromCandidateSearch } from '../../components/publicLanding/PublicFestivalMenu';

const DEFAULT_TENANT_ID = '45a0c1a0-bda0-4806-8477-f3fd3d6dfbbe';
const CAMPUS_TENANT_ID = '73ee92f3-d795-43eb-997e-380e52856424';
const LEGACY_TENANT_ALIAS = 'f87172d1-ed27-4db4-842c-cc00d3d56de2';

const CARD_ACCENTS = [
  {
    bg: PUBLIC_GLASS_THEME.purpleSoft,
    avatarBg: 'rgba(109, 40, 217, 0.16)',
    border: PUBLIC_GLASS_THEME.purpleBorder,
    text: PUBLIC_GLASS_THEME.purpleText,
    gradient: 'linear-gradient(135deg, rgba(109, 40, 217, 0.13), rgba(255, 255, 255, 0.80))',
  },
  {
    bg: PUBLIC_GLASS_THEME.redSoft,
    avatarBg: 'rgba(225, 29, 72, 0.15)',
    border: PUBLIC_GLASS_THEME.redBorder,
    text: PUBLIC_GLASS_THEME.redText,
    gradient: 'linear-gradient(135deg, rgba(225, 29, 72, 0.12), rgba(255, 255, 255, 0.80))',
  },
  {
    bg: PUBLIC_GLASS_THEME.blueSoft,
    avatarBg: 'rgba(37, 99, 235, 0.16)',
    border: PUBLIC_GLASS_THEME.blueBorder,
    text: PUBLIC_GLASS_THEME.blueText,
    gradient: 'linear-gradient(135deg, rgba(37, 99, 235, 0.13), rgba(255, 255, 255, 0.80))',
  },
  {
    bg: PUBLIC_GLASS_THEME.greenSoft,
    avatarBg: 'rgba(16, 185, 129, 0.16)',
    border: PUBLIC_GLASS_THEME.greenBorder,
    text: PUBLIC_GLASS_THEME.greenText,
    gradient: 'linear-gradient(135deg, rgba(16, 185, 129, 0.13), rgba(255, 255, 255, 0.80))',
  },
  {
    bg: PUBLIC_GLASS_THEME.amberSoft,
    avatarBg: 'rgba(245, 158, 11, 0.18)',
    border: PUBLIC_GLASS_THEME.amberBorder,
    text: PUBLIC_GLASS_THEME.amberText,
    gradient: 'linear-gradient(135deg, rgba(245, 158, 11, 0.14), rgba(255, 255, 255, 0.80))',
  },
];

function getStableAccentIndex(slug: string, fallbackIndex: number): number {
  if (!slug) return fallbackIndex % CARD_ACCENTS.length;
  let hash = 0;
  for (let i = 0; i < slug.length; i += 1) {
    hash = (hash * 31 + slug.charCodeAt(i)) >>> 0;
  }
  return hash % CARD_ACCENTS.length;
}

function CandidateSearchResultCard({
  candidate,
  index,
  isWide,
  festivalName,
  onPress,
}: {
  candidate: PublicCandidateSearchItem;
  index: number;
  isWide: boolean;
  festivalName?: string;
  onPress: () => void;
}) {
  const accent = CARD_ACCENTS[getStableAccentIndex(candidate.slug, index)];
  const initials = (candidate.name || 'C')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase();
  const chestBadge = festivalName
    ? `${festivalName} · Chest ${candidate.chest_number || '–'}`
    : candidate.chest_number
      ? `Chest ${candidate.chest_number}`
      : null;

  return (
    <TouchableOpacity
      accessibilityHint={festivalName ? `Opens ${festivalName} candidate profile` : "Opens the candidate's public profile"}
      accessibilityRole="button"
      onPress={onPress}
      style={[
        styles.candidateCard,
        webGlassSurface(18),
        {
          backgroundColor: accent.bg,
          borderColor: accent.border,
          ...(Platform.OS === 'web' ? { backgroundImage: accent.gradient } as any : {}),
        },
        isWide && styles.candidateCardWide,
      ]}
    >
      <View style={[styles.avatarBadge, { backgroundColor: accent.avatarBg, borderColor: accent.border }]}>
        <Text style={[styles.avatarBadgeText, { color: accent.text }]}>{initials}</Text>
      </View>
      <View style={styles.candidateInfo}>
        <Text numberOfLines={2} style={styles.candidateName}>{candidate.name}</Text>
        <View style={styles.metadataRow}>
          {chestBadge ? (
            <View style={styles.chestTag}>
              <Text style={styles.chestTagText}>{chestBadge}</Text>
            </View>
          ) : null}
          {candidate.category_code ? (
            <View style={styles.categoryTag}>
              <Text style={styles.categoryTagText}>{candidate.category_code}</Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={styles.chevronChip}>
        <ChevronRight size={17} color={PUBLIC_GLASS_THEME.ink} />
      </View>
    </TouchableOpacity>
  );
}

export default function CandidateSearchPage() {
  const params = useLocalSearchParams<{ tenant_id?: string | string[]; festival_id?: string | string[] }>();
  // Explicit tenant links retain their established one-festival behavior.
  return params.tenant_id || params.festival_id
    ? <ScopedCandidateSearchPage />
    : <DualCandidateSearchPage />;
}

function DualCandidateSearchPage() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Keep backend tenant isolation intact; only the frontend result list is unified.
  const consolium = usePublicCandidateSearch(DEFAULT_TENANT_ID, null, debouncedSearch.toLowerCase(), true);
  const campus = usePublicCandidateSearch(CAMPUS_TENANT_ID, null, debouncedSearch.toLowerCase(), true);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchText.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  const sources = useMemo(
    () => [
      { name: 'Consoulium', tenantId: DEFAULT_TENANT_ID, search: consolium },
      { name: 'Campus', tenantId: CAMPUS_TENANT_ID, search: campus },
    ],
    [consolium, campus],
  );

  const mergedCandidates = useMemo(
    () =>
      debouncedSearch
        ? mergeAndSortDualCandidates(
            sources.map(({ name, tenantId, search }) => ({
              tenantId,
              festivalName: name,
              items: search.data?.pages.flatMap((page) => page.items) ?? [],
            })),
            debouncedSearch,
          )
        : [],
    [debouncedSearch, sources],
  );

  const isWide = width >= 760;
  const isDebouncing = searchText.trim() !== debouncedSearch;
  const isAnyInitialLoading = sources.some(
    ({ search }) => search.isPending || (search.isFetching && !search.data),
  );
  const failedSources = sources.filter(({ search }) => search.isError && !search.data);
  const allSourcesFailed = failedSources.length === sources.length;
  const hasAnyMore = sources.some(({ search }) => search.hasNextPage);
  const isFetchingMore = sources.some(({ search }) => search.isFetchingNextPage);
  const hasNextPageError = sources.some(({ search }) => search.isFetchNextPageError);

  const retryFailedSources = () => {
    failedSources.forEach(({ search }) => {
      void search.refetch();
    });
  };

  const loadMoreFromAllSources = () => {
    sources.forEach(({ search }) => {
      if (search.hasNextPage && !search.isFetchingNextPage) {
        void search.fetchNextPage();
      }
    });
  };

  return (
    <PublicGlassBackdrop>
      <Head><title>Find Me · Consoulium and Campus</title></Head>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={[styles.container, { maxWidth: isWide ? 1020 : 580 }]}>
          <View style={styles.topBar}>
            <TouchableOpacity accessibilityRole="button" onPress={() => router.canGoBack() ? router.back() : Platform.OS === 'web' ? window.location.assign('/consoulium') : router.replace('/leaderboard' as any)} style={[styles.backButton, webGlassSurface(16)]}>
              <ArrowLeft size={16} color={PUBLIC_GLASS_THEME.ink} /><Text style={styles.backText}>Back</Text>
            </TouchableOpacity>
            <View style={[styles.brandPill, webGlassSurface(16)]}>
              <Image source={require('@/assets/images/consolium-crest.png')} resizeMode="contain" accessibilityLabel="Consolium logo" style={styles.brandLogo} />
              <Text style={styles.brandName}>CONSOULIUM 2K26</Text>
            </View>
          </View>
          <View style={styles.headingBlock}>
            <View style={styles.eyebrowPill}>
              <View style={styles.eyebrowDot} />
              <Text style={styles.eyebrow}>FIND ME · AYATIC CODEX</Text>
            </View>
            <Text style={[styles.title, isWide && styles.titleDesktop]}>Find a candidate</Text>
            <Text style={styles.subtitle}>Search by candidate name or chest number to view registered items and published results.</Text>
          </View>
          <View style={[styles.searchBox, webGlassSurface(20), isSearchFocused && styles.searchBoxFocused]}>
            <View style={[styles.searchIconChip, isSearchFocused && styles.searchIconChipActive]}>
              <Search size={18} color={isSearchFocused ? '#FFFFFF' : PUBLIC_GLASS_THEME.blue} />
            </View>
            <TextInput
              accessibilityLabel="Search Consoulium and Campus candidates"
              autoCapitalize="none"
              autoCorrect={false}
              onBlur={() => setIsSearchFocused(false)}
              onChangeText={setSearchText}
              onFocus={() => setIsSearchFocused(true)}
              placeholder="Chest number or name"
              placeholderTextColor="#64748B"
              returnKeyType="search"
              style={styles.searchInput}
              value={searchText}
            />
            {searchText ? <TouchableOpacity accessibilityLabel="Clear search" accessibilityRole="button" onPress={() => setSearchText('')} style={styles.clearButton}><X size={16} color={PUBLIC_GLASS_THEME.ink} /></TouchableOpacity> : null}
          </View>

          <View accessibilityLiveRegion="polite" style={styles.resultsHeading}>
            <Text style={styles.sectionTitle}>
              {isDebouncing ? 'Updating search' : debouncedSearch ? 'Search results' : 'Search to get started'}
            </Text>
            {!isDebouncing && mergedCandidates.length > 0 ? (
              <View style={styles.countPill}>
                <Text style={styles.resultCount}>
                  {mergedCandidates.length}{hasAnyMore ? '+' : ''} {mergedCandidates.length === 1 && !hasAnyMore ? 'candidate' : 'candidates'}
                </Text>
              </View>
            ) : null}
          </View>

          {isDebouncing ? (
            <View style={[styles.stateCardWrap, webGlassSurface(18)]}>
              <FestivalAccentBar height={5} />
              <View style={styles.stateCardBody}>
                <ActivityIndicator size="small" color={PUBLIC_GLASS_THEME.blue} />
                <Text style={styles.mutedText}>Updating search…</Text>
              </View>
            </View>
          ) : !debouncedSearch ? (
            <View style={[styles.stateCardWrap, webGlassSurface(18)]}>
              <FestivalAccentBar height={5} />
              <View style={styles.stateCardBody}>
                <View style={styles.emptyBadge}>
                  <Search size={21} color={PUBLIC_GLASS_THEME.blue} />
                </View>
                <Text style={styles.stateTitle}>Enter a name or chest number</Text>
                <Text style={styles.mutedText}>Matching candidate profiles will appear here.</Text>
              </View>
            </View>
          ) : mergedCandidates.length === 0 && isAnyInitialLoading ? (
            <View style={[styles.stateCardWrap, webGlassSurface(18)]}>
              <FestivalAccentBar height={5} />
              <View style={styles.stateCardBody}>
                <ActivityIndicator size="small" color={PUBLIC_GLASS_THEME.blue} />
                <Text style={styles.mutedText}>Searching candidates…</Text>
              </View>
            </View>
          ) : mergedCandidates.length === 0 && allSourcesFailed ? (
            <View style={[styles.stateCardWrap, webGlassSurface(18)]}>
              <FestivalAccentBar height={5} />
              <View style={styles.stateCardBody}>
                <Text style={styles.stateTitle}>Search could not be completed</Text>
                <Text style={styles.mutedText}>Check your connection and try again.</Text>
                <TouchableOpacity accessibilityRole="button" onPress={retryFailedSources} style={[styles.retryButton, webPrimaryGradient]}>
                  <Text style={styles.retryText}>Try again</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : mergedCandidates.length === 0 ? (
            <View style={[styles.stateCardWrap, webGlassSurface(18)]}>
              <FestivalAccentBar height={5} />
              <View style={styles.stateCardBody}>
                <View style={[styles.emptyBadge, { backgroundColor: PUBLIC_GLASS_THEME.redSoft, borderColor: PUBLIC_GLASS_THEME.redBorder }]}>
                  <UserRound size={20} color={PUBLIC_GLASS_THEME.redText} />
                </View>
                <Text style={styles.stateTitle}>No candidates found</Text>
                <Text style={styles.mutedText}>
                  {failedSources.length > 0
                    ? `${failedSources.map((s) => s.name).join(' & ')} search unavailable. Try again.`
                    : 'Try another spelling or chest number.'}
                </Text>
                {failedSources.length > 0 ? (
                  <TouchableOpacity accessibilityRole="button" onPress={retryFailedSources} style={[styles.retryButton, webPrimaryGradient]}>
                    <Text style={styles.retryText}>Try again</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          ) : (
            <View style={[styles.resultsGrid, isWide && styles.resultsGridWide]}>
              {mergedCandidates.map((item, index) => (
                <CandidateSearchResultCard
                  key={`${item.tenantId}:${item.candidate.slug}`}
                  candidate={item.candidate}
                  festivalName={item.festivalName}
                  index={index}
                  isWide={isWide}
                  onPress={() => router.push({ pathname: '/candidate/[slug]', params: { slug: item.candidate.slug, tenant_id: item.tenantId } } as any)}
                />
              ))}
            </View>
          )}

          {debouncedSearch && mergedCandidates.length > 0 && failedSources.length > 0 ? (
            <View style={[styles.inlineError, webGlassSurface(16)]}>
              <Text style={styles.inlineErrorText}>
                {failedSources.map((s) => s.name).join(' & ')} search unavailable.
              </Text>
              <TouchableOpacity accessibilityRole="button" onPress={retryFailedSources} style={styles.inlineRetryPill}>
                <Text style={styles.inlineRetryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {hasNextPageError ? (
            <View style={[styles.inlineError, webGlassSurface(16)]}>
              <Text style={styles.inlineErrorText}>More results could not be loaded.</Text>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => {
                  sources.forEach(({ search }) => {
                    if (search.isFetchNextPageError) void search.fetchNextPage();
                  });
                }}
                style={styles.inlineRetryPill}
              >
                <Text style={styles.inlineRetryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {hasAnyMore && !hasNextPageError ? (
            <TouchableOpacity
              accessibilityRole="button"
              disabled={isFetchingMore}
              onPress={loadMoreFromAllSources}
              style={[styles.loadMoreButton, webPrimaryGradient]}
            >
              {isFetchingMore ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.loadMoreText}>Load more candidates</Text>}
            </TouchableOpacity>
          ) : null}
        </View>
      </ScrollView>
      <PublicFestivalMenu
        currentId="find-me"
        tenantId={DEFAULT_TENANT_ID}
        onResetScroll={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}
      />
    </PublicGlassBackdrop>
  );
}

function ScopedCandidateSearchPage() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tenant_id?: string | string[]; festival_id?: string | string[] }>();
  const authTenantId = useAuthStore((state) => state.tenant_id);
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const routeTenant = Array.isArray(params.tenant_id) ? params.tenant_id[0] : params.tenant_id;
  const rawTenantId = routeTenant || authTenantId || LEGACY_TENANT_ALIAS;
  const tenantId = rawTenantId === LEGACY_TENANT_ALIAS ? DEFAULT_TENANT_ID : rawTenantId;
  const festivalId = Array.isArray(params.festival_id) ? params.festival_id[0] : params.festival_id;
  const { settings: publicFeatures, isLoading: featuresLoading, isError: featuresError, refetch: refetchFeatures } = useTenantFeatures(tenantId, true);
  const publicSearchEnabled = publicFeatures.modules.public_page
    && publicFeatures.sections.public_page.results
    && publicFeatures.sections.public_page.participant_results;
  const search = usePublicCandidateSearch(tenantId, festivalId, debouncedSearch.trim().toLowerCase(), !featuresLoading && publicSearchEnabled);
  const candidates = useMemo(
    () => sortCandidatesByRelevance(search.data?.pages.flatMap((page) => page.items) ?? [], debouncedSearch),
    [search.data, debouncedSearch],
  );
  const isWide = width >= 760;
  const isDebouncing = searchText.trim() !== debouncedSearch;

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchText.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  const handleBack = () =>
    navigateBackFromCandidateSearch({
      tenantId,
      festivalId,
      fallbackNative: () => {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace('/leaderboard' as any);
        }
      },
    });

  if (featuresLoading) {
    return (
      <PublicGlassBackdrop>
        <View style={styles.loadingScreen}>
          <View style={[styles.stateCardWrap, webGlassSurface(18), { width: '100%', maxWidth: 360 }]}>
            <FestivalAccentBar height={5} />
            <View style={styles.loadingCardBody}>
              <ActivityIndicator size="large" color={PUBLIC_GLASS_THEME.blue} />
              <Text style={styles.mutedText}>Loading Find Me…</Text>
            </View>
          </View>
        </View>
        <PublicFestivalMenu currentId="find-me" tenantId={tenantId} festivalId={festivalId} />
      </PublicGlassBackdrop>
    );
  }

  if (featuresError) {
    return (
      <PublicGlassBackdrop>
        <View style={styles.loadingScreen}>
          <View style={[styles.stateCardWrap, webGlassSurface(18), { width: '100%', maxWidth: 420 }]}>
            <FestivalAccentBar height={5} />
            <View style={styles.stateCardBody}>
              <Text style={styles.stateTitle}>Could not load Find Me</Text>
              <Text style={styles.mutedText}>Please check your connection and try again.</Text>
              <TouchableOpacity accessibilityRole="button" onPress={() => refetchFeatures()} style={[styles.retryButton, webPrimaryGradient]}>
                <Text style={styles.retryText}>Try again</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        <PublicFestivalMenu currentId="find-me" tenantId={tenantId} festivalId={festivalId} />
      </PublicGlassBackdrop>
    );
  }

  if (!publicSearchEnabled) {
    return <PublicUnavailableScreen title="Find Me unavailable." message="Candidate profiles are not enabled for this festival." />;
  }

  const openProfile = (slug: string) => {
    router.push({
      pathname: '/candidate/[slug]',
      params: { slug, tenant_id: tenantId, ...(festivalId ? { festival_id: festivalId } : {}) },
    } as any);
  };

  return (
    <PublicGlassBackdrop>
      <Head>
        <title>Find Me · Candidate Search</title>
        <meta name="description" content="Find a candidate profile by name or chest number." />
      </Head>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={[styles.container, { maxWidth: isWide ? 1020 : 580 }]}>
          <View style={styles.topBar}>
            <TouchableOpacity accessibilityRole="button" onPress={handleBack} style={[styles.backButton, webGlassSurface(16)]}>
              <ArrowLeft size={16} color={PUBLIC_GLASS_THEME.ink} />
              <Text style={styles.backText}>Back</Text>
            </TouchableOpacity>

            <View style={[styles.brandPill, webGlassSurface(16)]}>
              <Image source={require('@/assets/images/consolium-crest.png')} resizeMode="contain" accessibilityLabel="Consolium logo" style={styles.brandLogo} />
              <Text style={styles.brandName}>CONSOULIUM 2K26</Text>
            </View>
          </View>

          <View style={styles.headingBlock}>
            <View style={styles.eyebrowPill}>
              <View style={styles.eyebrowDot} />
              <Text style={styles.eyebrow}>FIND ME · AYATIC CODEX</Text>
            </View>
            <Text style={[styles.title, isWide && styles.titleDesktop]}>Find a candidate</Text>
            <Text style={styles.subtitle}>
              Search by candidate name or chest number to view registered items and published results.
            </Text>
          </View>

          <View style={[styles.searchBox, webGlassSurface(20), isSearchFocused && styles.searchBoxFocused]}>
            <View style={[styles.searchIconChip, isSearchFocused && styles.searchIconChipActive]}>
              <Search size={18} color={isSearchFocused ? '#FFFFFF' : PUBLIC_GLASS_THEME.blue} />
            </View>
            <TextInput
              accessibilityLabel="Search candidates by name or chest number"
              autoCapitalize="none"
              autoCorrect={false}
              onBlur={() => setIsSearchFocused(false)}
              onChangeText={setSearchText}
              onFocus={() => setIsSearchFocused(true)}
              placeholder="Chest number or name"
              placeholderTextColor="#64748B"
              returnKeyType="search"
              style={styles.searchInput}
              value={searchText}
            />
            {searchText.length > 0 ? (
              <TouchableOpacity accessibilityLabel="Clear search" accessibilityRole="button" onPress={() => setSearchText('')} style={styles.clearButton}>
                <X size={16} color={PUBLIC_GLASS_THEME.ink} />
              </TouchableOpacity>
            ) : null}
          </View>

          <View accessibilityLiveRegion="polite" style={styles.resultsHeading}>
            <Text style={styles.sectionTitle}>
              {isDebouncing ? 'Updating search' : debouncedSearch ? 'Search results' : 'Search to get started'}
            </Text>
            {!isDebouncing && candidates.length > 0 ? (
              <View style={styles.countPill}>
                <Text style={styles.resultCount}>{candidates.length}{search.hasNextPage ? '+' : ''} candidates</Text>
              </View>
            ) : null}
          </View>

          {isDebouncing ? (
            <View style={[styles.stateCardWrap, webGlassSurface(18)]}>
              <FestivalAccentBar height={5} />
              <View style={styles.stateCardBody}>
                <ActivityIndicator size="small" color={PUBLIC_GLASS_THEME.blue} />
                <Text style={styles.mutedText}>Updating search…</Text>
              </View>
            </View>
          ) : debouncedSearch.length === 0 ? (
            <View style={[styles.stateCardWrap, webGlassSurface(18)]}>
              <FestivalAccentBar height={5} />
              <View style={styles.stateCardBody}>
                <View style={styles.emptyBadge}>
                  <Search size={21} color={PUBLIC_GLASS_THEME.blue} />
                </View>
                <Text style={styles.stateTitle}>Enter a name or chest number</Text>
                <Text style={styles.mutedText}>Matching candidate profiles will appear here.</Text>
              </View>
            </View>
          ) : search.isPending || (search.isFetching && candidates.length === 0) ? (
            <View style={[styles.stateCardWrap, webGlassSurface(18)]}>
              <FestivalAccentBar height={5} />
              <View style={styles.stateCardBody}>
                <ActivityIndicator size="small" color={PUBLIC_GLASS_THEME.blue} />
                <Text style={styles.mutedText}>Searching candidates…</Text>
              </View>
            </View>
          ) : search.isError && candidates.length === 0 ? (
            <View style={[styles.stateCardWrap, webGlassSurface(18)]}>
              <FestivalAccentBar height={5} />
              <View style={styles.stateCardBody}>
                <Text style={styles.stateTitle}>Search could not be completed</Text>
                <Text style={styles.mutedText}>Check your connection and try again.</Text>
                <TouchableOpacity accessibilityRole="button" onPress={() => void search.refetch()} style={[styles.retryButton, webPrimaryGradient]}>
                  <Text style={styles.retryText}>Try again</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : candidates.length === 0 ? (
            <View style={[styles.stateCardWrap, webGlassSurface(18)]}>
              <FestivalAccentBar height={5} />
              <View style={styles.stateCardBody}>
                <View style={[styles.emptyBadge, { backgroundColor: PUBLIC_GLASS_THEME.redSoft, borderColor: PUBLIC_GLASS_THEME.redBorder }]}>
                  <UserRound size={20} color={PUBLIC_GLASS_THEME.redText} />
                </View>
                <Text style={styles.stateTitle}>No candidates found</Text>
                <Text style={styles.mutedText}>Try another spelling or chest number.</Text>
              </View>
            </View>
          ) : (
            <View style={[styles.resultsGrid, isWide && styles.resultsGridWide]}>
              {candidates.map((candidate, index) => (
                <CandidateSearchResultCard
                  key={candidate.slug}
                  candidate={candidate}
                  index={index}
                  isWide={isWide}
                  onPress={() => openProfile(candidate.slug)}
                />
              ))}
            </View>
          )}

          {search.isFetchNextPageError ? (
            <View style={[styles.inlineError, webGlassSurface(16)]}>
              <Text style={styles.inlineErrorText}>More results could not be loaded.</Text>
              <TouchableOpacity accessibilityRole="button" onPress={() => void search.fetchNextPage()} style={styles.inlineRetryPill}>
                <Text style={styles.inlineRetryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {search.hasNextPage && !search.isFetchNextPageError ? (
            <TouchableOpacity
              accessibilityRole="button"
              disabled={search.isFetchingNextPage}
              onPress={() => void search.fetchNextPage()}
              style={[styles.loadMoreButton, webPrimaryGradient]}
            >
              {search.isFetchingNextPage ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.loadMoreText}>Load more candidates</Text>}
            </TouchableOpacity>
          ) : null}
        </View>
      </ScrollView>
      <PublicFestivalMenu
        currentId="find-me"
        tenantId={tenantId}
        festivalId={festivalId}
        onResetScroll={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}
      />
    </PublicGlassBackdrop>
  );
}

const styles = {
  loadingScreen: { flex: 1, minHeight: (Platform.OS === 'web' ? '100vh' : undefined) as any, alignItems: 'center' as const, justifyContent: 'center' as const, padding: 24 },
  loadingCardBody: { alignItems: 'center' as const, justifyContent: 'center' as const, gap: 14, paddingHorizontal: 30, paddingVertical: 28 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 18, paddingTop: 26, paddingBottom: 92 },
  container: { width: '100%' as const, alignSelf: 'center' as const },
  topBar: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 12, marginBottom: 24 },
  backButton: { height: 40, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, paddingHorizontal: 15, borderRadius: 999, borderWidth: 1, borderColor: PUBLIC_GLASS_THEME.glassBorderStrong, backgroundColor: PUBLIC_GLASS_THEME.glassBgStrong },
  backText: { fontFamily: 'Outfit_600SemiBold', color: PUBLIC_GLASS_THEME.ink, fontSize: 13.5, fontWeight: '600' as const },
  brandPill: { height: 40, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: PUBLIC_GLASS_THEME.glassBorderStrong, backgroundColor: PUBLIC_GLASS_THEME.glassBgStrong },
  brandLogo: { width: 22, height: 22 },
  brandName: { fontFamily: 'Outfit_700Bold', color: PUBLIC_GLASS_THEME.ink, fontSize: 12, letterSpacing: 1.4, fontWeight: '700' as const },
  headingBlock: { marginBottom: 22, alignItems: 'flex-start' as const },
  eyebrowPill: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, backgroundColor: PUBLIC_GLASS_THEME.greenSoft, borderWidth: 1, borderColor: PUBLIC_GLASS_THEME.greenBorder, marginBottom: 12 },
  eyebrowDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: PUBLIC_GLASS_THEME.green, ...(Platform.OS === 'web' ? { boxShadow: '0 0 8px rgba(16, 185, 129, 0.72)' } as any : {}) },
  eyebrow: { fontFamily: 'Outfit_700Bold', color: PUBLIC_GLASS_THEME.greenText, fontSize: 11, fontWeight: '700' as const, letterSpacing: 1.5 },
  title: { fontFamily: 'Outfit_700Bold', color: PUBLIC_GLASS_THEME.ink, fontSize: 36, lineHeight: 40, fontWeight: '700' as const, letterSpacing: -0.9 },
  titleDesktop: { fontSize: 48, lineHeight: 52, letterSpacing: -1.4 },
  subtitle: { fontFamily: 'Outfit_400Regular', color: PUBLIC_GLASS_THEME.inkMuted, fontSize: 15, lineHeight: 22, marginTop: 8, maxWidth: 560 },
  searchBox: { minHeight: 58, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, paddingLeft: 10, paddingRight: 10, borderWidth: 1.5, borderColor: PUBLIC_GLASS_THEME.blueBorder, borderRadius: 999, backgroundColor: PUBLIC_GLASS_THEME.blueSoft, ...(Platform.OS === 'web' ? { backgroundImage: 'linear-gradient(135deg, rgba(37, 99, 235, 0.08), rgba(255, 255, 255, 0.88))' } as any : {}) },
  searchBoxFocused: { borderColor: PUBLIC_GLASS_THEME.blue, ...(Platform.OS === 'web' ? { boxShadow: '0 0 0 4px rgba(37, 99, 235, 0.14), 0 18px 42px -20px rgba(37, 99, 235, 0.28)' } as any : {}) },
  searchIconChip: { width: 38, height: 38, borderRadius: 19, backgroundColor: PUBLIC_GLASS_THEME.blueSoft, alignItems: 'center' as const, justifyContent: 'center' as const },
  searchIconChipActive: { backgroundColor: PUBLIC_GLASS_THEME.ink },
  searchInput: { fontFamily: 'Outfit_400Regular', flex: 1, minHeight: 52, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) as any, color: PUBLIC_GLASS_THEME.ink, fontSize: 15.5, paddingVertical: 0 },
  clearButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: PUBLIC_GLASS_THEME.surfaceSubtle, alignItems: 'center' as const, justifyContent: 'center' as const },
  resultsHeading: { minHeight: 48, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, marginTop: 18, marginBottom: 10 },
  sectionTitle: { fontFamily: 'Outfit_700Bold', color: PUBLIC_GLASS_THEME.ink, fontSize: 14.5, fontWeight: '700' as const },
  countPill: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, backgroundColor: PUBLIC_GLASS_THEME.glassBgStrong, borderWidth: 1, borderColor: PUBLIC_GLASS_THEME.glassBorder },
  resultCount: { fontFamily: 'Outfit_600SemiBold', color: PUBLIC_GLASS_THEME.inkMuted, fontSize: 12, fontWeight: '600' as const },
  resultsGrid: { gap: 12 },
  resultsGridWide: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 14 },
  candidateCard: { minHeight: 78, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 14, paddingHorizontal: 16, paddingVertical: 14, borderWidth: 1, borderColor: PUBLIC_GLASS_THEME.glassBorderStrong, borderRadius: 22, backgroundColor: PUBLIC_GLASS_THEME.glassBgStrong },
  candidateCardWide: { width: (Platform.OS === 'web' ? 'calc(50% - 7px)' : '48%') as any },
  avatarBadge: { width: 44, height: 44, borderRadius: 15, borderWidth: 1, alignItems: 'center' as const, justifyContent: 'center' as const },
  avatarBadgeText: { fontFamily: 'Outfit_700Bold', fontSize: 14, fontWeight: '800' as const, letterSpacing: 0.4 },
  candidateInfo: { flex: 1, minWidth: 0, gap: 6 },
  candidateName: { fontFamily: 'Outfit_700Bold', color: PUBLIC_GLASS_THEME.ink, fontSize: 15.5, fontWeight: '700' as const, letterSpacing: -0.2 },
  metadataRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6 },
  chestTag: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: PUBLIC_GLASS_THEME.blueSoft, borderWidth: 1, borderColor: PUBLIC_GLASS_THEME.blueBorder },
  chestTagText: { fontFamily: 'Outfit_700Bold', color: PUBLIC_GLASS_THEME.blueText, fontSize: 11, fontWeight: '700' as const, letterSpacing: 0.3 },
  categoryTag: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: PUBLIC_GLASS_THEME.surfaceSubtle, borderWidth: 1, borderColor: PUBLIC_GLASS_THEME.glassBorder },
  categoryTagText: { fontFamily: 'Outfit_700Bold', color: PUBLIC_GLASS_THEME.inkMuted, fontSize: 11, fontWeight: '700' as const, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  chevronChip: { width: 32, height: 32, borderRadius: 16, backgroundColor: PUBLIC_GLASS_THEME.surfaceSubtle, borderWidth: 1, borderColor: PUBLIC_GLASS_THEME.glassBorder, alignItems: 'center' as const, justifyContent: 'center' as const },
  stateCardWrap: { overflow: 'hidden' as const, borderWidth: 1, borderColor: PUBLIC_GLASS_THEME.blueBorder, borderRadius: 24, backgroundColor: PUBLIC_GLASS_THEME.blueSoft, ...(Platform.OS === 'web' ? { backgroundImage: 'linear-gradient(135deg, rgba(37, 99, 235, 0.08), rgba(109, 40, 217, 0.05), rgba(255, 255, 255, 0.86))' } as any : {}) },
  stateCardBody: { minHeight: 164, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 10, padding: 24 },
  emptyBadge: { width: 48, height: 48, borderRadius: 16, backgroundColor: PUBLIC_GLASS_THEME.blueSoft, borderWidth: 1, borderColor: PUBLIC_GLASS_THEME.blueBorder, alignItems: 'center' as const, justifyContent: 'center' as const, marginBottom: 2 },
  stateTitle: { fontFamily: 'Outfit_700Bold', color: PUBLIC_GLASS_THEME.ink, fontSize: 17, fontWeight: '700' as const, textAlign: 'center' as const, letterSpacing: -0.2 },
  mutedText: { fontFamily: 'Outfit_400Regular', color: PUBLIC_GLASS_THEME.inkMuted, fontSize: 13.5, lineHeight: 20, textAlign: 'center' as const },
  retryButton: { minHeight: 44, alignItems: 'center' as const, justifyContent: 'center' as const, marginTop: 6, paddingHorizontal: 22, borderRadius: 999, backgroundColor: PUBLIC_GLASS_THEME.ink },
  retryText: { fontFamily: 'Outfit_700Bold', color: '#FFFFFF', fontSize: 13.5, fontWeight: '700' as const },
  inlineError: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingHorizontal: 16, paddingVertical: 12, marginTop: 14, borderRadius: 18, borderWidth: 1, borderColor: PUBLIC_GLASS_THEME.redBorder, backgroundColor: PUBLIC_GLASS_THEME.glassBgStrong },
  inlineErrorText: { fontFamily: 'Outfit_600SemiBold', color: PUBLIC_GLASS_THEME.dangerText, fontSize: 13, fontWeight: '600' as const },
  inlineRetryPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: PUBLIC_GLASS_THEME.greenSoft, borderWidth: 1, borderColor: PUBLIC_GLASS_THEME.greenBorder },
  inlineRetryText: { fontFamily: 'Outfit_700Bold', color: PUBLIC_GLASS_THEME.greenText, fontSize: 12.5, fontWeight: '700' as const },
  loadMoreButton: { minHeight: 48, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, marginTop: 18, paddingHorizontal: 24, borderRadius: 999, backgroundColor: PUBLIC_GLASS_THEME.ink, alignSelf: 'center' as const, minWidth: 220 },
  loadMoreText: { fontFamily: 'Outfit_700Bold', color: '#FFFFFF', fontSize: 14, fontWeight: '700' as const },
};
