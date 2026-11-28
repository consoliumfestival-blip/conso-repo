import React, { useEffect, useMemo, useState } from 'react';
import Head from 'expo-router/head';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Image, Platform, ScrollView, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { ArrowLeft, ChevronRight, Search, Sparkles, UserRound, X } from 'lucide-react-native';
import { useAuthStore } from '../../core/store/authStore';
import { useTenantFeatures } from '../../core/hooks/useTenantFeatures';
import { usePublicCandidateSearch } from '../../core/hooks/useParticipants';
import { PublicUnavailableScreen } from '../../components/publicLanding/PublicUnavailableScreen';
import { PUBLIC_GLASS_THEME, PublicGlassBackdrop, webGlassSurface, webPrimaryGradient } from '../../components/publicLanding/PublicGlassBackdrop';

const DEFAULT_TENANT_ID = '45a0c1a0-bda0-4806-8477-f3fd3d6dfbbe';
const LEGACY_TENANT_ALIAS = 'f87172d1-ed27-4db4-842c-cc00d3d56de2';

const CARD_ACCENTS = [
  { bg: 'rgba(109, 40, 217, 0.22)', border: 'rgba(167, 139, 250, 0.42)', text: '#DDD6FE' },
  { bg: 'rgba(225, 29, 72, 0.20)', border: 'rgba(251, 113, 133, 0.42)', text: '#FECDD3' },
  { bg: 'rgba(37, 99, 235, 0.22)', border: 'rgba(96, 165, 250, 0.44)', text: '#BFDBFE' },
  { bg: 'rgba(16, 185, 129, 0.20)', border: 'rgba(52, 211, 153, 0.42)', text: '#A7F3D0' },
  { bg: 'rgba(245, 158, 11, 0.20)', border: 'rgba(251, 191, 36, 0.44)', text: '#FDE68A' },
];

export default function CandidateSearchPage() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tenant_id?: string | string[]; festival_id?: string | string[] }>();
  const authTenantId = useAuthStore((state) => state.tenant_id);
  const { width } = useWindowDimensions();
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
  const candidates = useMemo(() => search.data?.pages.flatMap((page) => page.items) ?? [], [search.data]);
  const isWide = width >= 760;
  const isDebouncing = searchText.trim() !== debouncedSearch;

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchText.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  if (featuresLoading) {
    return (
      <PublicGlassBackdrop>
        <View style={styles.loadingScreen}>
          <View style={[styles.loadingCard, webGlassSurface(18)]}>
            <ActivityIndicator size="large" color={PUBLIC_GLASS_THEME.green} />
            <Text style={styles.mutedText}>Loading Find Me…</Text>
          </View>
        </View>
      </PublicGlassBackdrop>
    );
  }

  if (featuresError) {
    return (
      <PublicGlassBackdrop>
        <View style={styles.loadingScreen}>
          <View style={[styles.stateCard, webGlassSurface(18), { width: '100%', maxWidth: 420 }]}>
            <Text style={styles.stateTitle}>Could not load Find Me</Text>
            <Text style={styles.mutedText}>Please check your connection and try again.</Text>
            <TouchableOpacity accessibilityRole="button" onPress={() => refetchFeatures()} style={[styles.retryButton, webPrimaryGradient]}>
              <Text style={styles.retryText}>Try again</Text>
            </TouchableOpacity>
          </View>
        </View>
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
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={[styles.container, { maxWidth: isWide ? 1020 : 580 }]}>
          <View style={styles.topBar}>
            <TouchableOpacity accessibilityRole="button" onPress={() => router.back()} style={[styles.backButton, webGlassSurface(16)]}>
              <ArrowLeft size={16} color={PUBLIC_GLASS_THEME.ink} />
              <Text style={styles.backText}>Back</Text>
            </TouchableOpacity>

            <View style={[styles.brandPill, webGlassSurface(16)]}>
              <Image source={require('@/assets/images/consolium-crest.png')} resizeMode="contain" accessibilityLabel="Consolium logo" style={styles.brandLogo} />
              <Text style={styles.brandName}>CONSOULIUM 2K26</Text>
            </View>
          </View>

          <View style={styles.headingBlock}>
            <View style={[styles.eyebrowPill, webGlassSurface(14)]}>
              <View style={styles.eyebrowDot} />
              <Text style={styles.eyebrow}>FIND ME · AYATIC CODEX</Text>
            </View>
            <Text style={[styles.title, isWide && styles.titleDesktop]}>Find a candidate</Text>
            <Text style={styles.subtitle}>
              Search by candidate name or chest number to view registered items and published results.
            </Text>
          </View>

          <View style={[styles.searchBox, webGlassSurface(20), isSearchFocused && styles.searchBoxFocused]}>
            <View style={styles.searchIconChip}>
              <Search size={18} color={isSearchFocused ? PUBLIC_GLASS_THEME.blueText : PUBLIC_GLASS_THEME.inkMuted} />
            </View>
            <TextInput
              accessibilityLabel="Search candidates by name or chest number"
              autoCapitalize="none"
              autoCorrect={false}
              onBlur={() => setIsSearchFocused(false)}
              onChangeText={setSearchText}
              onFocus={() => setIsSearchFocused(true)}
              placeholder="Chest number or name"
              placeholderTextColor="#94A3B8"
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
            <View style={[styles.stateCard, webGlassSurface(18)]}>
              <ActivityIndicator size="small" color={PUBLIC_GLASS_THEME.green} />
              <Text style={styles.mutedText}>Updating search…</Text>
            </View>
          ) : debouncedSearch.length === 0 ? (
            <View style={[styles.stateCard, webGlassSurface(18)]}>
              <View style={styles.emptyBadge}>
                <Sparkles size={20} color={PUBLIC_GLASS_THEME.blueText} />
              </View>
              <Text style={styles.stateTitle}>Enter a name or chest number</Text>
              <Text style={styles.mutedText}>Matching candidate profiles will appear here.</Text>
            </View>
          ) : search.isPending || (search.isFetching && candidates.length === 0) ? (
            <View style={[styles.stateCard, webGlassSurface(18)]}>
              <ActivityIndicator size="small" color={PUBLIC_GLASS_THEME.green} />
              <Text style={styles.mutedText}>Searching candidates…</Text>
            </View>
          ) : search.isError && candidates.length === 0 ? (
            <View style={[styles.stateCard, webGlassSurface(18)]}>
              <Text style={styles.stateTitle}>Search could not be completed</Text>
              <Text style={styles.mutedText}>Check your connection and try again.</Text>
              <TouchableOpacity accessibilityRole="button" onPress={() => void search.refetch()} style={[styles.retryButton, webPrimaryGradient]}>
                <Text style={styles.retryText}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : candidates.length === 0 ? (
            <View style={[styles.stateCard, webGlassSurface(18)]}>
              <View style={styles.emptyBadge}>
                <UserRound size={20} color={PUBLIC_GLASS_THEME.inkMuted} />
              </View>
              <Text style={styles.stateTitle}>No candidates found</Text>
              <Text style={styles.mutedText}>Try another spelling or chest number.</Text>
            </View>
          ) : (
            <View style={[styles.resultsGrid, isWide && styles.resultsGridWide]}>
              {candidates.map((candidate, index) => {
                const accent = CARD_ACCENTS[index % CARD_ACCENTS.length];
                const initials = (candidate.name || 'C')
                  .trim()
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((p) => p.charAt(0))
                  .join('')
                  .toUpperCase();
                return (
                  <TouchableOpacity
                    key={candidate.slug}
                    accessibilityHint="Opens the candidate's public profile"
                    accessibilityRole="button"
                    onPress={() => openProfile(candidate.slug)}
                    style={[styles.candidateCard, webGlassSurface(18), isWide && styles.candidateCardWide]}
                  >
                    <View style={[styles.avatarBadge, { backgroundColor: accent.bg, borderColor: accent.border }]}>
                      <Text style={[styles.avatarBadgeText, { color: accent.text }]}>{initials}</Text>
                    </View>
                    <View style={styles.candidateInfo}>
                      <Text numberOfLines={2} style={styles.candidateName}>{candidate.name}</Text>
                      <View style={styles.metadataRow}>
                        {candidate.chest_number ? (
                          <View style={styles.chestTag}>
                            <Text style={styles.chestTagText}>Chest {candidate.chest_number}</Text>
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
              })}
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
    </PublicGlassBackdrop>
  );
}

const styles = {
  loadingScreen: { flex: 1, minHeight: (Platform.OS === 'web' ? '100vh' : undefined) as any, alignItems: 'center' as const, justifyContent: 'center' as const, padding: 24 },
  loadingCard: { alignItems: 'center' as const, justifyContent: 'center' as const, gap: 14, paddingHorizontal: 30, paddingVertical: 28, borderRadius: 24, borderWidth: 1, borderColor: PUBLIC_GLASS_THEME.glassBorder, backgroundColor: PUBLIC_GLASS_THEME.glassBg },
  scrollContent: { flexGrow: 1, paddingHorizontal: 18, paddingTop: 22, paddingBottom: 56 },
  container: { width: '100%' as const, alignSelf: 'center' as const },
  topBar: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 12, marginBottom: 24 },
  backButton: { height: 40, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, paddingHorizontal: 15, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.22)', backgroundColor: PUBLIC_GLASS_THEME.glassBg },
  backText: { color: PUBLIC_GLASS_THEME.ink, fontSize: 13.5, fontWeight: '600' as const },
  brandPill: { height: 40, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: PUBLIC_GLASS_THEME.glassBorder, backgroundColor: PUBLIC_GLASS_THEME.glassBg },
  brandLogo: { width: 22, height: 22 },
  brandName: { color: PUBLIC_GLASS_THEME.ink, fontSize: 12, letterSpacing: 1.4, fontWeight: '700' as const },
  headingBlock: { marginBottom: 22, alignItems: 'flex-start' as const },
  eyebrowPill: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(37, 99, 235, 0.16)', borderWidth: 1, borderColor: 'rgba(96, 165, 250, 0.30)', marginBottom: 12 },
  eyebrowDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: PUBLIC_GLASS_THEME.green, ...(Platform.OS === 'web' ? { boxShadow: '0 0 10px #10B981' } as any : {}) },
  eyebrow: { color: '#DBEAFE', fontSize: 11, fontWeight: '700' as const, letterSpacing: 1.5 },
  title: { color: '#FFFFFF', fontSize: 36, lineHeight: 40, fontWeight: '700' as const, letterSpacing: -0.9 },
  titleDesktop: { fontSize: 48, lineHeight: 52, letterSpacing: -1.4 },
  subtitle: { color: PUBLIC_GLASS_THEME.inkMuted, fontSize: 15, lineHeight: 22, marginTop: 8, maxWidth: 560 },
  searchBox: { minHeight: 54, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, paddingLeft: 10, paddingRight: 10, borderWidth: 1, borderColor: PUBLIC_GLASS_THEME.glassBorderStrong, borderRadius: 999, backgroundColor: PUBLIC_GLASS_THEME.glassBg },
  searchBoxFocused: { borderColor: 'rgba(96, 165, 250, 0.72)', backgroundColor: PUBLIC_GLASS_THEME.glassBgStrong },
  searchIconChip: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255, 255, 255, 0.06)', alignItems: 'center' as const, justifyContent: 'center' as const },
  searchInput: { flex: 1, minHeight: 50, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) as any, color: '#FFFFFF', fontSize: 15.5, paddingVertical: 0 },
  clearButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255, 255, 255, 0.10)', alignItems: 'center' as const, justifyContent: 'center' as const },
  resultsHeading: { minHeight: 48, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, marginTop: 18, marginBottom: 10 },
  sectionTitle: { color: '#FFFFFF', fontSize: 14.5, fontWeight: '700' as const },
  countPill: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, backgroundColor: 'rgba(255, 255, 255, 0.07)', borderWidth: 1, borderColor: PUBLIC_GLASS_THEME.glassBorder },
  resultCount: { color: '#CBD5E1', fontSize: 12, fontWeight: '600' as const },
  resultsGrid: { gap: 12 },
  resultsGridWide: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 14 },
  candidateCard: { minHeight: 78, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 14, paddingHorizontal: 16, paddingVertical: 14, borderWidth: 1, borderColor: PUBLIC_GLASS_THEME.glassBorder, borderRadius: 22, backgroundColor: PUBLIC_GLASS_THEME.glassBg },
  candidateCardWide: { width: (Platform.OS === 'web' ? 'calc(50% - 7px)' : '48%') as any },
  avatarBadge: { width: 44, height: 44, borderRadius: 15, borderWidth: 1, alignItems: 'center' as const, justifyContent: 'center' as const },
  avatarBadgeText: { fontSize: 14, fontWeight: '800' as const, letterSpacing: 0.4 },
  candidateInfo: { flex: 1, minWidth: 0, gap: 6 },
  candidateName: { color: '#FFFFFF', fontSize: 15.5, fontWeight: '700' as const, letterSpacing: -0.2 },
  metadataRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6 },
  chestTag: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: PUBLIC_GLASS_THEME.blueSoft, borderWidth: 1, borderColor: PUBLIC_GLASS_THEME.blueBorder },
  chestTagText: { color: PUBLIC_GLASS_THEME.blueText, fontSize: 11, fontWeight: '700' as const, letterSpacing: 0.3 },
  categoryTag: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: 'rgba(255, 255, 255, 0.08)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.14)' },
  categoryTagText: { color: '#E2E8F0', fontSize: 11, fontWeight: '700' as const, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  chevronChip: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255, 255, 255, 0.08)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.14)', alignItems: 'center' as const, justifyContent: 'center' as const },
  stateCard: { minHeight: 156, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 10, padding: 24, borderWidth: 1, borderColor: PUBLIC_GLASS_THEME.glassBorder, borderRadius: 24, backgroundColor: PUBLIC_GLASS_THEME.glassBg },
  emptyBadge: { width: 46, height: 46, borderRadius: 16, backgroundColor: 'rgba(37, 99, 235, 0.16)', borderWidth: 1, borderColor: 'rgba(96, 165, 250, 0.30)', alignItems: 'center' as const, justifyContent: 'center' as const, marginBottom: 2 },
  stateTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' as const, textAlign: 'center' as const },
  mutedText: { color: PUBLIC_GLASS_THEME.inkMuted, fontSize: 13.5, textAlign: 'center' as const },
  retryButton: { minHeight: 42, alignItems: 'center' as const, justifyContent: 'center' as const, marginTop: 4, paddingHorizontal: 20, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(147, 197, 253, 0.45)', backgroundColor: PUBLIC_GLASS_THEME.blue },
  retryText: { color: '#FFFFFF', fontSize: 13.5, fontWeight: '700' as const },
  inlineError: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingHorizontal: 16, paddingVertical: 12, marginTop: 14, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(253, 164, 175, 0.28)', backgroundColor: PUBLIC_GLASS_THEME.glassBg },
  inlineErrorText: { color: PUBLIC_GLASS_THEME.dangerText, fontSize: 13 },
  inlineRetryPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: PUBLIC_GLASS_THEME.greenSoft, borderWidth: 1, borderColor: PUBLIC_GLASS_THEME.greenBorder },
  inlineRetryText: { color: PUBLIC_GLASS_THEME.greenText, fontSize: 12.5, fontWeight: '700' as const },
  loadMoreButton: { minHeight: 48, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, marginTop: 18, paddingHorizontal: 24, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(147, 197, 253, 0.45)', backgroundColor: PUBLIC_GLASS_THEME.blue, alignSelf: 'center' as const, minWidth: 220 },
  loadMoreText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' as const },
};
