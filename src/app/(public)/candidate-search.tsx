import React, { useEffect, useMemo, useState } from 'react';
import Head from 'expo-router/head';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Image, Platform, ScrollView, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { ArrowLeft, ChevronRight, Search, X } from 'lucide-react-native';
import { useAuthStore } from '../../core/store/authStore';
import { useTenantFeatures } from '../../core/hooks/useTenantFeatures';
import { usePublicCandidateSearch } from '../../core/hooks/useParticipants';
import { PublicUnavailableScreen } from '../../components/publicLanding/PublicUnavailableScreen';

const DEFAULT_TENANT_ID = '45a0c1a0-bda0-4806-8477-f3fd3d6dfbbe';
const LEGACY_TENANT_ALIAS = 'f87172d1-ed27-4db4-842c-cc00d3d56de2';

export default function CandidateSearchPage() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tenant_id?: string | string[]; festival_id?: string | string[] }>();
  const authTenantId = useAuthStore((state) => state.tenant_id);
  const { width } = useWindowDimensions();
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const routeTenant = Array.isArray(params.tenant_id) ? params.tenant_id[0] : params.tenant_id;
  const rawTenantId = routeTenant || authTenantId || LEGACY_TENANT_ALIAS;
  const tenantId = rawTenantId === LEGACY_TENANT_ALIAS ? DEFAULT_TENANT_ID : rawTenantId;
  const festivalId = Array.isArray(params.festival_id) ? params.festival_id[0] : params.festival_id;
  const { settings: publicFeatures, isLoading: featuresLoading } = useTenantFeatures(tenantId, true);
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
    return <View style={styles.loadingScreen}>
      <ActivityIndicator size="large" color="#10B981" />
      <Text style={styles.mutedText}>Loading Student Portal…</Text>
    </View>;
  }

  if (!publicSearchEnabled) {
    return <PublicUnavailableScreen title="Student Portal unavailable." message="Candidate profiles are not enabled for this festival." />;
  }

  const openProfile = (slug: string) => {
    router.push({
      pathname: '/candidate/[slug]',
      params: { slug, tenant_id: tenantId, ...(festivalId ? { festival_id: festivalId } : {}) },
    } as any);
  };

  return (
    <View style={styles.screen}>
      <Head>
        <title>Student Portal · Candidate Search</title>
        <meta name="description" content="Find a candidate profile by name or chest number." />
      </Head>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={[styles.container, { maxWidth: isWide ? 900 : 560 }]}>
          <TouchableOpacity accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={17} color="#AFC2D8" />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>

          <View style={styles.brandRow}>
            <Image source={require('@/assets/images/consolium-crest.png')} resizeMode="contain" accessibilityLabel="Consolium logo" style={styles.brandLogo} />
            <Text style={styles.brandName}>CONSOLIUM</Text>
          </View>
          <View style={styles.headingBlock}>
            <Text style={styles.eyebrow}>STUDENT PORTAL</Text>
            <Text style={styles.title}>Find a candidate</Text>
            <Text style={styles.subtitle}>Search by candidate name or chest number.</Text>
          </View>

          <View style={styles.searchBox}>
            <Search size={19} color="#AFC2D8" />
            <TextInput
              accessibilityLabel="Search candidates by name or chest number"
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setSearchText}
              placeholder="Chest number or name"
              placeholderTextColor="#8FA4BD"
              returnKeyType="search"
              style={styles.searchInput}
              value={searchText}
            />
            {searchText.length > 0 ? (
              <TouchableOpacity accessibilityLabel="Clear search" accessibilityRole="button" onPress={() => setSearchText('')} style={styles.clearButton}>
                <X size={17} color="#AFC2D8" />
              </TouchableOpacity>
            ) : null}
          </View>

          <View accessibilityLiveRegion="polite" style={styles.resultsHeading}>
            <Text style={styles.sectionTitle}>{isDebouncing ? 'Updating search' : debouncedSearch ? 'Search results' : 'Search to get started'}</Text>
            {!isDebouncing && candidates.length > 0 ? <Text style={styles.resultCount}>{candidates.length}{search.hasNextPage ? '+' : ''} candidates</Text> : null}
          </View>

          {isDebouncing ? (
            <View style={styles.stateCard}>
              <ActivityIndicator size="small" color="#10B981" />
              <Text style={styles.mutedText}>Updating search…</Text>
            </View>
          ) : debouncedSearch.length === 0 ? (
            <View style={styles.stateCard}>
              <Text style={styles.stateTitle}>Enter a name or chest number</Text>
              <Text style={styles.mutedText}>Matching candidate profiles will appear here.</Text>
            </View>
          ) : search.isPending || (search.isFetching && candidates.length === 0) ? (
            <View style={styles.stateCard}>
              <ActivityIndicator size="small" color="#10B981" />
              <Text style={styles.mutedText}>Searching candidates…</Text>
            </View>
          ) : search.isError && candidates.length === 0 ? (
            <View style={styles.stateCard}>
              <Text style={styles.stateTitle}>Search could not be completed</Text>
              <Text style={styles.mutedText}>Check your connection and try again.</Text>
              <TouchableOpacity accessibilityRole="button" onPress={() => void search.refetch()} style={styles.retryButton}>
                <Text style={styles.retryText}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : candidates.length === 0 ? (
            <View style={styles.stateCard}>
              <Text style={styles.stateTitle}>No candidates found</Text>
              <Text style={styles.mutedText}>Try another spelling or chest number.</Text>
            </View>
          ) : (
            <View style={[styles.resultsGrid, isWide && styles.resultsGridWide]}>
              {candidates.map((candidate) => (
                <TouchableOpacity
                  key={candidate.slug}
                  accessibilityHint="Opens the candidate's public profile"
                  accessibilityRole="button"
                  onPress={() => openProfile(candidate.slug)}
                  style={[styles.candidateCard, isWide && styles.candidateCardWide]}
                >
                  <View style={styles.candidateInfo}>
                    <Text numberOfLines={2} style={styles.candidateName}>{candidate.name}</Text>
                    <View style={styles.metadataRow}>
                      {candidate.chest_number ? <Text style={styles.metadataText}>Chest {candidate.chest_number}</Text> : null}
                      {candidate.category_code ? <Text style={styles.metadataText}>{candidate.category_code}</Text> : null}
                    </View>
                  </View>
                  <ChevronRight size={18} color="#8FA4BD" />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {search.isFetchNextPageError ? (
            <View style={styles.inlineError}>
              <Text style={styles.inlineErrorText}>More results could not be loaded.</Text>
              <TouchableOpacity accessibilityRole="button" onPress={() => void search.fetchNextPage()}>
                <Text style={styles.inlineRetryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {search.hasNextPage && !search.isFetchNextPageError ? (
            <TouchableOpacity
              accessibilityRole="button"
              disabled={search.isFetchingNextPage}
              onPress={() => void search.fetchNextPage()}
              style={styles.loadMoreButton}
            >
              {search.isFetchingNextPage ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.loadMoreText}>Load more candidates</Text>}
            </TouchableOpacity>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = {
  screen: { flex: 1, minHeight: (Platform.OS === 'web' ? '100vh' : undefined) as any, backgroundColor: '#030E21' },
  loadingScreen: { flex: 1, minHeight: (Platform.OS === 'web' ? '100vh' : undefined) as any, backgroundColor: '#030E21', alignItems: 'center' as const, justifyContent: 'center' as const, gap: 14, padding: 24 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 42 },
  container: { width: '100%' as const, alignSelf: 'center' as const },
  backButton: { minHeight: 42, alignSelf: 'flex-start' as const, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, paddingHorizontal: 10 },
  backText: { color: '#AFC2D8', fontSize: 14, fontWeight: '600' as const },
  brandRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 10, marginTop: 12 },
  brandLogo: { width: 34, height: 34 },
  brandName: { color: '#FFFFFF', fontSize: 16, letterSpacing: 2, fontWeight: '800' as const },
  headingBlock: { marginTop: 26, marginBottom: 24, alignItems: 'center' as const },
  eyebrow: { color: '#6EE7B7', fontSize: 11, fontWeight: '800' as const, letterSpacing: 1.6 },
  title: { color: '#FFFFFF', fontSize: 30, lineHeight: 38, fontWeight: '800' as const, marginTop: 5 },
  subtitle: { color: '#AFC2D8', fontSize: 15, lineHeight: 22, marginTop: 4, textAlign: 'center' as const },
  searchBox: { minHeight: 52, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 11, paddingHorizontal: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.09)', ...(Platform.OS === 'web' ? { backdropFilter: 'blur(18px)', boxShadow: '0 12px 40px rgba(0,0,0,0.16)' } as any : {}) },
  searchInput: { flex: 1, minHeight: 50, outlineStyle: 'none' as any, color: '#FFFFFF', fontSize: 15, paddingVertical: 0 },
  clearButton: { minWidth: 38, minHeight: 42, alignItems: 'center' as const, justifyContent: 'center' as const },
  resultsHeading: { minHeight: 48, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, marginTop: 12 },
  sectionTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' as const },
  resultCount: { color: '#AFC2D8', fontSize: 12 },
  resultsGrid: { gap: 9 },
  resultsGridWide: { flexDirection: 'row' as const, flexWrap: 'wrap' as const },
  candidateCard: { minHeight: 68, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 12, paddingHorizontal: 15, paddingVertical: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.07)', ...(Platform.OS === 'web' ? { backdropFilter: 'blur(16px)' } as any : {}) },
  candidateCardWide: { width: 'calc(50% - 5px)' as any },
  candidateInfo: { flex: 1, gap: 5 },
  candidateName: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' as const },
  metadataRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  metadataText: { color: '#AFC2D8', fontSize: 12 },
  stateCard: { minHeight: 130, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 9, padding: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.06)', ...(Platform.OS === 'web' ? { backdropFilter: 'blur(16px)' } as any : {}) },
  stateTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' as const, textAlign: 'center' as const },
  mutedText: { color: '#AFC2D8', fontSize: 13, textAlign: 'center' as const },
  retryButton: { minHeight: 42, alignItems: 'center' as const, justifyContent: 'center' as const, marginTop: 4, paddingHorizontal: 16, borderRadius: 10, backgroundColor: '#087F68' },
  retryText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' as const },
  inlineError: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, padding: 12 },
  inlineErrorText: { color: '#FDA4AF', fontSize: 13 },
  inlineRetryText: { color: '#6EE7B7', fontSize: 13, fontWeight: '700' as const },
  loadMoreButton: { minHeight: 46, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, marginTop: 12, borderRadius: 11, backgroundColor: '#087F68' },
  loadMoreText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' as const },
  popupBackdrop: { flex: 1, minHeight: (Platform.OS === 'web' ? '100vh' : undefined) as any, backgroundColor: '#0B1124', alignItems: 'center' as const, justifyContent: 'center' as const, padding: 20 },
  popupCard: { position: 'relative' as const, width: '100%' as const, maxWidth: 380, backgroundColor: '#FFFFFF', borderRadius: 24, paddingHorizontal: 24, paddingTop: 28, paddingBottom: 24, alignItems: 'center' as const, overflow: 'hidden' as const, borderWidth: 1, borderColor: 'rgba(32,33,36,0.12)' },
  popupBars: { position: 'absolute' as const, top: 0, left: 0, right: 0, height: 5, flexDirection: 'row' as const },
  popupBarSegment: { flex: 1, height: 5 },
  popupBadge: { backgroundColor: 'rgba(37,99,235,0.1)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, marginBottom: 12 },
  popupBadgeText: { color: '#2563EB', fontSize: 11, fontWeight: '800' as const, letterSpacing: 1.3 },
  popupTitle: { color: '#10142F', fontSize: 24, fontWeight: '800' as const, textAlign: 'center' as const, marginBottom: 8 },
  popupMessage: { color: '#5F6368', fontSize: 14.5, lineHeight: 22, textAlign: 'center' as const, marginBottom: 20 },
  popupActionBtn: { backgroundColor: '#202124', borderRadius: 999, paddingHorizontal: 28, paddingVertical: 13, alignItems: 'center' as const, justifyContent: 'center' as const },
  popupActionText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' as const },
};
