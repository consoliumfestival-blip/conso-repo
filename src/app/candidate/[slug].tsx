import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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

const palette = {
  bg: '#030E21',
  surface: 'rgba(255, 255, 255, 0.03)',
  surfaceLight: 'rgba(255, 255, 255, 0.05)',
  text: '#FFFFFF',
  muted: 'rgba(255, 255, 255, 0.6)',
  line: 'rgba(255, 255, 255, 0.08)',
  green: '#10B981',      // Emerald Green
  softGreen: 'rgba(16, 185, 129, 0.12)',
  borderGreen: 'rgba(16, 185, 129, 0.25)',
  yellow: '#FFDF00',     // Amber Gold
  softYellow: 'rgba(255, 223, 0, 0.12)',
  borderYellow: 'rgba(255, 223, 0, 0.25)',
  blue: '#3B82F6',       // Blue
  softBlue: 'rgba(59, 130, 246, 0.12)',
  borderBlue: 'rgba(59, 130, 246, 0.25)',
};

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
        tone: palette.green,
        bg: palette.softGreen,
        border: palette.borderGreen,
        glow: 'rgba(16, 185, 129, 0.18)',
      },
      {
        id: 'results',
        label: 'Published Results',
        value: `${results.length}`,
        icon: ShieldCheck,
        tone: palette.blue,
        bg: palette.softBlue,
        border: palette.borderBlue,
        glow: 'rgba(59, 130, 246, 0.18)',
      },
      {
        id: 'wins',
        label: 'First Places',
        value: `${results.filter((result) => result.rank === 1).length}`,
        icon: Trophy,
        tone: palette.yellow,
        bg: palette.softYellow,
        border: palette.borderYellow,
        glow: 'rgba(255, 223, 0, 0.18)',
      },
      /* Hidden for now - to be published after Sahithyolsav
      {
        id: 'points',
        label: 'Public Points',
        value: `${results.reduce((sum, result) => sum + (result.points_awarded || 0), 0)}`,
        icon: Medal,
        tone: palette.yellow,
        bg: palette.softYellow,
        border: palette.borderYellow,
        glow: 'rgba(255, 223, 0, 0.18)',
      },
      */
    ];
  }, [candidate]);

  if (profileQuery.isLoading) {
    return (
      <View style={styles.screen}>
        <LinearGradient
          colors={['#030F26', '#021E1B', '#02241F']}
          start={{ x: 0.1, y: 0.1 }}
          end={{ x: 0.9, y: 0.9 }}
          style={styles.gradientBgCenter}
        >
          <ActivityIndicator color={palette.green} size="large" />
          <Text style={styles.centerText}>Loading candidate profile...</Text>
        </LinearGradient>
      </View>
    );
  }

  if (profileQuery.error || !candidate?.profile) {
    return (
      <View style={styles.screen}>
        <LinearGradient
          colors={['#030F26', '#021E1B', '#02241F']}
          start={{ x: 0.1, y: 0.1 }}
          end={{ x: 0.9, y: 0.9 }}
          style={styles.gradientBgCenter}
        >
          <View style={styles.emptyIcon}>
            <UserRound size={32} color={palette.green} />
          </View>
          <Text style={styles.emptyTitle}>Profile not available</Text>
          <Text style={styles.emptyMessage}>
            This candidate profile may be disabled or not published for public viewing.
          </Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={16} color={palette.text} />
            <Text style={styles.backButtonText}>Go back</Text>
          </TouchableOpacity>
        </LinearGradient>
      </View>
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
    <View style={styles.screen}>
      <LinearGradient
        colors={['#030F26', '#021E1B', '#02241F']}
        start={{ x: 0.1, y: 0.1 }}
        end={{ x: 0.9, y: 0.9 }}
        style={styles.gradientBg}
      >
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
          <TouchableOpacity onPress={() => router.back()} style={styles.topBack}>
            <ArrowLeft size={16} color="rgba(255,255,255,0.76)" />
            <Text style={styles.topBackText}>Back to Portal</Text>
          </TouchableOpacity>

          <View style={[
            styles.hero, 
            isDesktop && styles.heroDesktop,
            {
              ...Platform.select({
                web: { 
                  boxShadow: '0 15px 35px rgba(0, 0, 0, 0.7), 0 5px 25px rgba(16, 185, 129, 0.2)',
                  backdropFilter: isMobile ? 'none' : 'blur(16px)'
                },
                default: { shadowColor: palette.green, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 12 }
              }) as any
            }
          ]}>
            <View style={[styles.avatar, isMobile && styles.avatarMobile]}>
              <Text style={[styles.avatarInitials, isMobile && styles.avatarInitialsMobile]}>
                {avatarInitials}
              </Text>
            </View>
            <View style={styles.heroMain}>
              <View style={styles.publicPill}>
                <Sparkles size={14} color={palette.green} />
                <Text style={styles.publicPillText}>Public Candidate Profile</Text>
              </View>
              <Text style={[styles.name, isMobile && styles.nameMobile]}>{profile.name}</Text>
              <View style={styles.metaRow}>
                {profile.category_code && (
                  <View style={styles.metaPill}>
                    <Award size={14} color={palette.green} />
                    <Text style={styles.metaPillText}>{profile.category_code}</Text>
                  </View>
                )}
                {profile.organisation_name && (
                  <View style={styles.metaPillGreen}>
                    <Building2 size={14} color={palette.yellow} />
                    <Text style={styles.metaPillGreenText} numberOfLines={1}>
                      {profile.organisation_name}
                    </Text>
                  </View>
                )}
              </View>
              {profile.bio ? (
                <Text style={styles.bio}>{profile.bio}</Text>
              ) : (
                <Text style={styles.bioMuted}>Candidate bio has not been added yet.</Text>
              )}
            </View>
          </View>

          <View style={[styles.statsGrid, isMobile && styles.statsGridMobile]}>
            {stats.map((stat) => {
              const Icon = stat.icon;
              return (
                <View 
                  key={stat.id} 
                  style={[
                    styles.statCard, 
                    { 
                      ...Platform.select({
                        web: { 
                          boxShadow: `0 12px 25px rgba(0, 0, 0, 0.65), 0 4px 15px ${stat.glow}`,
                          backdropFilter: isMobile ? 'none' : 'blur(16px)'
                        },
                        default: { shadowColor: stat.tone, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 10 }
                      }) as any
                    }
                  ]}
                >
                  <View style={[styles.statIcon, { backgroundColor: stat.bg, borderColor: stat.border }]}>
                    <Icon size={22} color={stat.tone} />
                  </View>
                  <Text style={styles.statValue}>{stat.value}</Text>
                  <Text style={styles.statLabel}>{stat.label}</Text>
                </View>
              );
            })}
          </View>

          <View style={[styles.sections, isDesktop && styles.sectionsDesktop]}>
            <View style={[
              styles.sectionCard,
              isDesktop && { flex: 1 },
              {
                ...Platform.select({
                  web: { 
                    boxShadow: '0 15px 30px rgba(0, 0, 0, 0.6), 0 5px 20px rgba(16, 185, 129, 0.12)',
                    backdropFilter: isMobile ? 'none' : 'blur(16px)'
                  },
                  default: { shadowColor: palette.green, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 12 }
                }) as any
              }
            ]}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Participated Items</Text>
              </View>
              {participated_items.length === 0 ? (
                <Text style={styles.emptySectionText}>No public participation entries are available.</Text>
              ) : (
                participated_items.map((item, idx) => (
                  <View key={item.registration_id} style={[
                    styles.itemRow,
                    idx === participated_items.length - 1 && { borderBottomWidth: 0 }
                  ]}>
                    <View style={[styles.itemIcon, { backgroundColor: palette.softGreen, borderColor: palette.borderGreen }]}>
                      <BookOpen size={16} color={palette.green} />
                    </View>
                    <View style={styles.itemMain}>
                      <Text style={styles.itemName} numberOfLines={2}>
                        {item.item_name_ml || item.item_name}
                      </Text>
                      <Text style={styles.itemMeta} numberOfLines={1}>
                        {(item.category_codes || []).join(' / ') || 'General'} · {item.participation_type}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>

            <View style={[
              styles.sectionCard,
              isDesktop && { flex: 1 },
              {
                ...Platform.select({
                  web: { 
                    boxShadow: '0 15px 30px rgba(0, 0, 0, 0.6), 0 5px 20px rgba(255, 223, 0, 0.12)',
                    backdropFilter: isMobile ? 'none' : 'blur(16px)'
                  },
                  default: { shadowColor: palette.yellow, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 12 }
                }) as any
              }
            ]}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Published Results</Text>
              </View>
              {published_results.length === 0 ? (
                <Text style={styles.emptySectionText}>No public-visible results are published yet.</Text>
              ) : (
                published_results.map((result, idx) => (
                  <View key={result.result_id} style={[
                    styles.resultRow,
                    idx === published_results.length - 1 && { borderBottomWidth: 0 }
                  ]}>
                    <View style={[styles.rankBadge, { backgroundColor: palette.softYellow, borderColor: palette.borderYellow }]}>
                      <Text style={styles.rankText}>{result.rank ?? '-'}</Text>
                    </View>
                    <View style={styles.itemMain}>
                      <Text style={styles.itemName} numberOfLines={2}>
                        {result.item_name_ml || result.item_name}
                      </Text>
                      <Text style={styles.itemMeta} numberOfLines={1}>
                        {formatDate(result.published_at)}{result.grade ? ` · Grade ${result.grade}` : ''}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          </View>
        </ScrollView>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#030E21',
  },
  gradientBg: {
    flex: 1,
  },
  gradientBgCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 18,
    paddingBottom: 48,
    maxWidth: 1000,
    width: '100%',
    alignSelf: 'center',
  },
  contentDesktop: {
    padding: 32,
  },
  contentMobile: {
    padding: 12,
    paddingBottom: 32,
  },
  centerText: {
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 13,
    marginTop: 12,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontFamily: 'Poppins_700Bold',
    color: '#FFFFFF',
    fontSize: 22,
    textAlign: 'center',
  },
  emptyMessage: {
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 13.5,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 380,
    marginTop: 8,
  },
  backButton: {
    height: 38,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 20,
  },
  backButtonText: {
    fontFamily: 'Poppins_700Bold',
    color: '#FFFFFF',
    fontSize: 12.5,
  },
  topBack: {
    height: 38,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  topBackText: {
    fontFamily: 'Poppins_700Bold',
    color: 'rgba(255,255,255,0.76)',
    fontSize: 12.5,
  },
  hero: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    padding: 24,
    gap: 18,
  },
  heroDesktop: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 32,
  },
  avatar: {
    width: 132,
    height: 132,
    borderRadius: 66,
    borderWidth: 3,
    borderColor: '#10B981',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    boxShadow: '0 0 25px rgba(16, 185, 129, 0.25)',
  },
  avatarMobile: {
    width: 104,
    height: 104,
    borderRadius: 52,
  },
  avatarInitials: {
    color: '#D1FAE5',
    fontFamily: 'Poppins_900Black',
    fontSize: 42,
    letterSpacing: 1,
  },
  avatarInitialsMobile: {
    fontSize: 34,
  },
  heroMain: {
    flex: 1,
    minWidth: 0,
  },
  publicPill: {
    alignSelf: 'flex-start',
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 10,
  },
  publicPillText: {
    fontFamily: 'Poppins_700Bold',
    color: '#10B981',
    fontSize: 9.5,
    textTransform: 'uppercase',
  },
  name: {
    fontFamily: 'Poppins_900Black',
    color: '#FFFFFF',
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: -0.5,
  },
  nameMobile: {
    fontSize: 26,
    lineHeight: 32,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  metaPill: {
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metaPillText: {
    fontFamily: 'Poppins_700Bold',
    color: '#10B981',
    fontSize: 10,
    textTransform: 'uppercase',
  },
  metaPillGreen: {
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 223, 0, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 223, 0, 0.25)',
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: '100%',
  },
  metaPillGreenText: {
    fontFamily: 'Poppins_700Bold',
    color: '#FFDF00',
    fontSize: 10,
    textTransform: 'uppercase',
    flexShrink: 1,
  },
  bio: {
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 14.5,
    lineHeight: 22,
    marginTop: 14,
    maxWidth: 760,
  },
  bioMuted: {
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 13.5,
    lineHeight: 20,
    marginTop: 14,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 20,
  },
  statsGridMobile: {
    flexDirection: 'column',
    gap: 12,
  },
  statCard: {
    flex: 1,
    minHeight: 110,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    padding: 16,
  },
  statIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  statValue: {
    fontFamily: 'Poppins_900Black',
    color: '#FFFFFF',
    fontSize: 22,
    lineHeight: 26,
  },
  statLabel: {
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 11.5,
    marginTop: 2,
  },
  sections: {
    gap: 20,
    marginTop: 20,
  },
  sectionsDesktop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  sectionCard: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    overflow: 'hidden',
  },
  sectionHeader: {
    minHeight: 56,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sectionTitle: {
    fontFamily: 'Poppins_700Bold',
    color: '#FFFFFF',
    fontSize: 15,
  },
  emptySectionText: {
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 12.5,
    padding: 18,
    lineHeight: 20,
  },
  itemRow: {
    minHeight: 68,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  itemIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemMain: {
    flex: 1,
    minWidth: 0,
  },
  itemName: {
    fontFamily: 'Poppins_700Bold',
    color: '#FFFFFF',
    fontSize: 13.5,
  },
  itemMeta: {
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 11.5,
    marginTop: 2,
  },
  resultRow: {
    minHeight: 74,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rankBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    fontFamily: 'Poppins_900Black',
    color: '#FFDF00',
    fontSize: 13.5,
  },
  pointsBox: {
    width: 52,
    alignItems: 'flex-end',
  },
  pointsValue: {
    fontFamily: 'Poppins_900Black',
    color: '#10B981',
    fontSize: 18,
    lineHeight: 20,
  },
  pointsLabel: {
    fontFamily: 'Poppins_700Bold',
    color: 'rgba(255, 255, 255, 0.3)',
    fontSize: 9,
    textTransform: 'uppercase',
  },
});
