import React, { useMemo, useState } from 'react';
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
  TextInput,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Svg, { Polygon, Line, Circle, Text as SvgText, Rect, G } from 'react-native-svg';
import {
  ArrowLeft,
  Award,
  Building2,
  Medal,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
  UserRound,
  TrendingUp,
  AlertCircle,
  BarChart3,
  Search,
  Download
} from 'lucide-react-native';
import { useUnitProfile } from '../../core/hooks/useUnitProfile';
import { usePublicLeaderboard } from '../../core/hooks/useLeaderboard';
import { generateUnitReport } from '../../utils/pdfGenerator';

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
  red: '#EF4444',
  softRed: 'rgba(239, 68, 68, 0.12)',
  borderRed: 'rgba(239, 68, 68, 0.25)',
};

export default function PublicUnitProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const unitId = Array.isArray(params.id) ? params.id[0] : params.id;
  const { width } = useWindowDimensions();
  const isDesktop = (width || 0) >= 1024;
  const isMobile = (width || 0) < 640;

  const [activeChartPoint, setActiveChartPoint] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  const profileQuery = useUnitProfile(unitId);
  const unitData = profileQuery.data;

  // We can just omit tenantId and festivalId for now to get global
  const leaderboardQuery = usePublicLeaderboard(null, null);

  const unitLeaderboardInfo = useMemo(() => {
    if (!leaderboardQuery.data || !unitData) return null;
    const sorted = [...leaderboardQuery.data].sort((a, b) => b.total_points - a.total_points);
    const index = sorted.findIndex(row => row.organisation_id === unitData.id);
    if (index !== -1) {
      return {
        rank: index + 1,
        totalPoints: sorted[index].total_points,
      };
    }
    return { rank: '-', totalPoints: 0 };
  }, [leaderboardQuery.data, unitData]);

  const stats = useMemo(() => {
    if (!unitData) return [];
    return [
      {
        id: 'participants',
        label: 'Total Participants',
        value: `${unitData.stats.totalParticipants}`,
        icon: Users,
        tone: palette.blue,
        bg: palette.softBlue,
        border: palette.borderBlue,
        glow: 'rgba(59, 130, 246, 0.18)',
      },
      {
        id: 'points',
        label: 'Total Points',
        value: `${unitLeaderboardInfo?.totalPoints ?? '-'}`,
        icon: Medal,
        tone: palette.yellow,
        bg: palette.softYellow,
        border: palette.borderYellow,
        glow: 'rgba(255, 223, 0, 0.18)',
      },
      {
        id: 'rank',
        label: 'Current Rank',
        value: `${unitLeaderboardInfo?.rank ?? '-'}`,
        icon: Trophy,
        tone: palette.green,
        bg: palette.softGreen,
        border: palette.borderGreen,
        glow: 'rgba(16, 185, 129, 0.18)',
      },
      {
        id: 'absent',
        label: 'Absentee Items',
        value: `${(unitData.stats.totalMissedItems ?? 0) > 0 ? unitData.stats.totalMissedItems : 'View'}`,
        icon: AlertCircle,
        tone: palette.red,
        bg: palette.softRed,
        border: palette.borderRed,
        glow: 'rgba(239, 68, 68, 0.18)',
        onPress: () => router.push(`/unit-profile/${unitData.id}/missing-items`)
      },
    ];
  }, [unitData, unitLeaderboardInfo, router]);

  if (profileQuery.isLoading || leaderboardQuery.isLoading) {
    return (
      <View style={styles.screen}>
        <LinearGradient
          colors={['#030F26', '#021E1B', '#02241F']}
          start={{ x: 0.1, y: 0.1 }}
          end={{ x: 0.9, y: 0.9 }}
          style={styles.gradientBgCenter}
        >
          <ActivityIndicator color={palette.blue} size="large" />
          <Text style={styles.centerText}>Loading unit profile...</Text>
        </LinearGradient>
      </View>
    );
  }

  if (profileQuery.error || !unitData) {
    return (
      <View style={styles.screen}>
        <LinearGradient
          colors={['#030F26', '#021E1B', '#02241F']}
          start={{ x: 0.1, y: 0.1 }}
          end={{ x: 0.9, y: 0.9 }}
          style={styles.gradientBgCenter}
        >
          <View style={[styles.emptyIcon, { backgroundColor: palette.softBlue, borderColor: palette.borderBlue }]}>
            <Building2 size={32} color={palette.blue} />
          </View>
          <Text style={styles.emptyTitle}>Unit not found</Text>
          <Text style={styles.emptyMessage}>
            {profileQuery.error ? profileQuery.error.message : 'The unit profile you are looking for might be disabled or does not exist.'}
          </Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={16} color={palette.text} />
            <Text style={styles.backButtonText}>Go back</Text>
          </TouchableOpacity>
        </LinearGradient>
      </View>
    );
  }

  const { participants } = unitData;

  const categories = useMemo(() => {
    const cats = new Set<string>();
    participants.forEach(p => {
      if (p.category_code) cats.add(p.category_code);
    });
    return ['All', ...Array.from(cats)].sort();
  }, [participants]);

  const filteredParticipants = useMemo(() => {
    return participants.filter(p => {
      const matchSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          p.chest_number?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchCat = selectedCategory === 'All' || p.category_code === selectedCategory;
      return matchSearch && matchCat;
    });
  }, [participants, searchQuery, selectedCategory]);

  const getParticipantStatus = (p: any) => {
    let maxRank = Infinity;
    let hasResult = false;
    let totalPts = 0;
    
    p.registrations.forEach((r: any) => {
      r.results.forEach((res: any) => {
        hasResult = true;
        totalPts += res.points_awarded || 0;
        if (res.rank && res.rank < maxRank) maxRank = res.rank;
      });
    });
    
    if (!hasResult) return { label: 'Pending Results', color: palette.muted, icon: ShieldCheck };
    if (maxRank === 1) return { label: `1st Rank / ${totalPts} Pts`, color: palette.yellow, icon: Trophy };
    if (maxRank === 2) return { label: `2nd Rank / ${totalPts} Pts`, color: palette.blue, icon: Medal };
    if (maxRank === 3) return { label: `3rd Rank / ${totalPts} Pts`, color: palette.green, icon: Medal };
    return { label: `${totalPts} Pts`, color: palette.green, icon: Award };
  };

  const categoryStats = useMemo(() => {
    if (!unitData) return [];
    const map: Record<string, { points: number; participants: number }> = {};
    unitData.participants.forEach((p: any) => {
      const cat = p.category_code || 'Uncategorized';
      if (!map[cat]) map[cat] = { points: 0, participants: 0 };
      
      map[cat].participants += 1;

      p.registrations.forEach((r: any) => {
        r.results.forEach((res: any) => {
          map[cat].points += (res.points_awarded || 0);
        });
      });
    });

    const items = Object.keys(map).map(cat => ({
      category: cat,
      points: map[cat].points,
      participants: map[cat].participants
    })).filter(c => c.points > 0 || c.participants > 0).sort((a, b) => b.participants - a.participants);
    
    return items;
  }, [unitData]);
  
  const maxCategoryParticipants = categoryStats.length > 0 ? Math.max(...categoryStats.map(c => c.participants)) : 0;

  return (
    <View style={styles.screen}>
      <LinearGradient
        colors={['#030F26', '#011536', '#011C40']}
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
                  boxShadow: '0 15px 35px rgba(0, 0, 0, 0.7), 0 5px 25px rgba(59, 130, 246, 0.2)',
                  backdropFilter: isMobile ? 'none' : 'blur(16px)'
                },
                default: { shadowColor: palette.blue, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 12 }
              }) as any
            }
          ]}>
            <View style={[styles.avatar, isMobile && styles.avatarMobile, { borderColor: palette.blue }]}>
              <Building2 size={isMobile ? 42 : 58} color={palette.blue} />
            </View>
            <View style={styles.heroMain}>
              <View style={[styles.publicPill, { backgroundColor: palette.softBlue, borderColor: palette.borderBlue }]}>
                <Sparkles size={14} color={palette.blue} />
                <Text style={[styles.publicPillText, { color: palette.blue }]}>Premium Unit Profile</Text>
              </View>
              <Text style={[styles.name, isMobile && styles.nameMobile]}>{unitData.name}</Text>
              <View style={styles.metaRow}>
                <View style={styles.metaPillGreen}>
                  <TrendingUp size={14} color={palette.yellow} />
                  <Text style={styles.metaPillGreenText}>
                    Rank {unitLeaderboardInfo?.rank ?? '-'}
                  </Text>
                </View>
                <View style={[styles.metaPillGreen, { backgroundColor: palette.softGreen, borderColor: palette.borderGreen }]}>
                  <Medal size={14} color={palette.green} />
                  <Text style={[styles.metaPillGreenText, { color: palette.green }]}>
                    {unitLeaderboardInfo?.totalPoints ?? 0} Points
                  </Text>
                </View>
              </View>

              <TouchableOpacity 
                style={styles.pdfButton}
                onPress={() => {
                  if (unitData) {
                    generateUnitReport(unitData, unitLeaderboardInfo?.totalPoints || 0);
                  }
                }}
              >
                <Download size={14} color="#FFFFFF" />
                <Text style={styles.pdfButtonText}>Download Report</Text>
              </TouchableOpacity>
            </View>
            
            {/* Radar Chart in Hero */}
            {categoryStats.length > 0 && (
              <View style={[styles.heroChartContainer, isMobile && { marginTop: 10, alignSelf: 'center' }]}>
                {(() => {
                  const size = isMobile ? 180 : 200;
                  const cx = size / 2;
                  const cy = size / 2;
                  const r = (size / 2) - 30; // Room for text labels

                  const paddedData = [...categoryStats];
                  while (paddedData.length < 3) {
                    paddedData.push({ category: '', points: 0, participants: 0 });
                  }

                  const angleStep = (Math.PI * 2) / paddedData.length;
                  const maxVal = Math.max(1, maxCategoryParticipants); 

                  const points = paddedData.map((d, i) => {
                    const angle = i * angleStep - Math.PI / 2;
                    const valueRadius = (d.participants / maxVal) * r;
                    return {
                      x: cx + valueRadius * Math.cos(angle),
                      y: cy + valueRadius * Math.sin(angle),
                      labelX: cx + (r + 16) * Math.cos(angle),
                      labelY: cy + (r + 16) * Math.sin(angle),
                      label: d.category,
                      value: d.participants
                    };
                  });

                  const dataPolygonString = points.map(p => `${p.x},${p.y}`).join(' ');

                  return (
                    <Svg width={size} height={size}>
                      {/* Grid levels */}
                      {[1, 2, 3, 4, 5].map((level) => {
                        const levelR = (r / 5) * level;
                        const levelPoints = paddedData.map((_, i) => {
                          const angle = i * angleStep - Math.PI / 2;
                          return `${cx + levelR * Math.cos(angle)},${cy + levelR * Math.sin(angle)}`;
                        }).join(' ');
                        return (
                          <Polygon key={level} points={levelPoints} stroke="rgba(255,255,255,0.08)" strokeWidth="1" fill={level % 2 === 0 ? "rgba(255,255,255,0.02)" : "none"} />
                        );
                      })}

                      {/* Axes */}
                      {paddedData.map((_, i) => {
                        const angle = i * angleStep - Math.PI / 2;
                        return (
                          <Line key={i} x1={cx} y1={cy} x2={cx + r * Math.cos(angle)} y2={cy + r * Math.sin(angle)} stroke="rgba(255,255,255,0.15)" strokeWidth="1" strokeDasharray="3,3" />
                        );
                      })}

                      {/* Data Polygon */}
                      <Polygon points={dataPolygonString} fill="rgba(249, 115, 22, 0.25)" stroke="#F97316" strokeWidth="2" strokeLinejoin="round" />

                      {/* Data Points & Labels */}
                      {points.map((p, i) => (
                        <React.Fragment key={i}>
                          <Circle cx={p.x} cy={p.y} r={3} fill="#030E21" stroke="#F97316" strokeWidth="1.5" />
                          
                          {/* Invisible hit area for better touch/hover */}
                          <Circle 
                            cx={p.x} 
                            cy={p.y} 
                            r={20} 
                            fill="transparent"
                            onPress={() => setActiveChartPoint(activeChartPoint === i ? null : i)}
                            {...(Platform.OS === 'web' ? {
                              onMouseEnter: () => setActiveChartPoint(i),
                              onMouseLeave: () => setActiveChartPoint(null)
                            } : {})}
                          />

                          {p.label ? (
                            <SvgText
                              x={p.labelX}
                              y={p.labelY}
                              fill={activeChartPoint === i ? "#F97316" : "rgba(255,255,255,0.8)"}
                              fontSize={activeChartPoint === i ? "10" : "9"}
                              fontFamily={activeChartPoint === i ? "Poppins_700Bold" : "Poppins_500Medium"}
                              textAnchor="middle"
                              alignmentBaseline="middle"
                            >
                              {p.label}
                            </SvgText>
                          ) : null}

                          {/* Tooltip */}
                          {activeChartPoint === i && (
                            <G x={p.x} y={p.y - 25}>
                              <Rect x={-50} y={-14} width={100} height={22} fill="#FFFFFF" rx={4} />
                              <SvgText
                                fill="#030E21"
                                fontSize="10"
                                fontFamily="Poppins_700Bold"
                                textAnchor="middle"
                                alignmentBaseline="middle"
                              >
                                {p.value} Participants
                              </SvgText>
                            </G>
                          )}
                        </React.Fragment>
                      ))}
                    </Svg>
                  );
                })()}
              </View>
            )}
          </View>

          <View style={[styles.statsGrid, isMobile && styles.statsGridMobile]}>
            {stats.map((stat) => {
              const Icon = stat.icon;
              return (
                <TouchableOpacity 
                  key={stat.id} 
                  onPress={stat.onPress}
                  activeOpacity={stat.onPress ? 0.7 : 1}
                  style={[
                    styles.statCard, 
                    { 
                      ...Platform.select({
                        web: { 
                          boxShadow: `0 12px 25px rgba(0, 0, 0, 0.65), 0 4px 15px ${stat.glow}`,
                          backdropFilter: isMobile ? 'none' : 'blur(16px)',
                          cursor: stat.onPress ? 'pointer' : 'default'
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
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={[
            styles.sectionCard,
            { marginTop: 20 },
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
              <Text style={styles.sectionTitle}>Participants ({filteredParticipants.length})</Text>
            </View>

            <View style={styles.filterSection}>
              <View style={styles.searchContainer}>
                <Search size={18} color="rgba(255,255,255,0.4)" />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search by name or chest number..."
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
              </View>
              
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryScroll}>
                {categories.map(cat => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.categoryPill, selectedCategory === cat && styles.categoryPillActive]}
                    onPress={() => setSelectedCategory(cat)}
                  >
                    <Text style={[styles.categoryPillText, selectedCategory === cat && styles.categoryPillTextActive]}>
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {filteredParticipants.length === 0 ? (
              <Text style={styles.emptySectionText}>No participants found.</Text>
            ) : (
              filteredParticipants.map((participant, idx) => {
                const status = getParticipantStatus(participant);
                const StatusIcon = status.icon;
                return (
                  <TouchableOpacity 
                    key={participant.id}
                    onPress={() => {
                      if (participant.profile_slug) {
                        router.push(`/candidate/${participant.profile_slug}`);
                      }
                    }}
                    style={[
                      styles.participantRow,
                      idx === filteredParticipants.length - 1 && { borderBottomWidth: 0 }
                    ]}
                  >
                    <View style={styles.partAvatar}>
                      {participant.photo_url ? (
                        <Image source={{ uri: participant.photo_url }} style={styles.partImage} resizeMode="cover" />
                      ) : (
                        <UserRound size={20} color={palette.blue} />
                      )}
                    </View>
                    <View style={styles.partMain}>
                      <Text style={styles.partName} numberOfLines={1}>
                        {participant.name}
                      </Text>
                      <View style={styles.partMetaRow}>
                        <Text style={styles.partMetaText}>{participant.chest_number}</Text>
                        <Text style={styles.partDot}>·</Text>
                        <Text style={styles.partMetaText}>{participant.category_code}</Text>
                      </View>
                    </View>
                    <View style={styles.partStatus}>
                      <StatusIcon size={14} color={status.color} />
                      <Text style={[styles.partStatusText, { color: status.color }]}>{status.label}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
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
    borderWidth: 1,
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
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    boxShadow: '0 0 25px rgba(59, 130, 246, 0.25)',
  },
  avatarMobile: {
    width: 104,
    height: 104,
    borderRadius: 52,
  },
  heroMain: {
    flex: 1,
    minWidth: 0,
  },
  pdfButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    borderWidth: 1,
    borderColor: '#3B82F6',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginTop: 12,
    alignSelf: 'flex-start',
    gap: 8,
  },
  pdfButtonText: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 12,
    color: '#FFFFFF',
  },
  publicPill: {
    alignSelf: 'flex-start',
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 10,
  },
  publicPillText: {
    fontFamily: 'Poppins_700Bold',
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
  heroChartContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
  },
  emptySectionText: {
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 12.5,
    padding: 18,
    lineHeight: 20,
  },
  participantRow: {
    minHeight: 74,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  partAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: 'rgba(59, 130, 246, 0.3)',
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  partImage: {
    width: '100%',
    height: '100%',
  },
  partMain: {
    flex: 1,
    minWidth: 0,
  },
  partName: {
    fontFamily: 'Poppins_700Bold',
    color: '#FFFFFF',
    fontSize: 14,
  },
  partMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  partMetaText: {
    fontFamily: 'Poppins_700Bold',
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 11,
    textTransform: 'uppercase',
  },
  partDot: {
    fontFamily: 'Poppins_700Bold',
    color: 'rgba(255, 255, 255, 0.2)',
    fontSize: 11,
  },
  partStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  partStatusText: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 11,
  },
  filterSection: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    paddingHorizontal: 14,
    height: 44,
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontFamily: 'Poppins_400Regular',
    fontSize: 13,
    color: '#FFFFFF',
    outlineStyle: 'none',
  } as any,
  categoryScroll: {
    gap: 8,
  },
  categoryPill: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  categoryPillActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderColor: '#3B82F6',
  },
  categoryPillText: {
    fontFamily: 'Poppins_500Medium',
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
  },
  categoryPillTextActive: {
    color: '#3B82F6',
    fontFamily: 'Poppins_700Bold',
  }
});
