import React, { useMemo, useState } from 'react';
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
  AlertCircle,
  FileQuestion,
  Info
} from 'lucide-react-native';
import { useUnitProfile } from '../../../core/hooks/useUnitProfile';
import { useFestival } from '../../../core/hooks/useFestival';

const palette = {
  bg: '#030E21',
  text: '#FFFFFF',
  muted: 'rgba(255, 255, 255, 0.6)',
  blue: '#3B82F6',
  softBlue: 'rgba(59, 130, 246, 0.12)',
  borderBlue: 'rgba(59, 130, 246, 0.25)',
  red: '#EF4444',
  softRed: 'rgba(239, 68, 68, 0.12)',
  borderRed: 'rgba(239, 68, 68, 0.25)',
  orange: '#F97316',
  softOrange: 'rgba(249, 115, 22, 0.12)',
  borderOrange: 'rgba(249, 115, 22, 0.25)',
};

export default function MissingItemsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const unitId = Array.isArray(params.id) ? params.id[0] : params.id;
  const { width } = useWindowDimensions();
  const isDesktop = (width || 0) >= 1024;
  const isMobile = (width || 0) < 640;

  const [activeTab, setActiveTab] = useState<'missed' | 'unregistered'>('missed');

  const profileQuery = useUnitProfile(unitId);
  const { useActiveFestival, useItems } = useFestival();
  const { data: festival } = useActiveFestival();
  const itemsQuery = useItems(festival?.id);

  const unitData = profileQuery.data;
  const allItems = itemsQuery.data || [];

  const missedRegistrations = useMemo(() => {
    if (!unitData) return [];
    const missed: any[] = [];
    unitData.participants.forEach((p: any) => {
      const isPartRejected = p.status === 'rejected';
      (p.registrations || []).forEach((r: any) => {
        if (isPartRejected || r.status === 'rejected') {
          missed.push({
            ...r,
            participantName: p.name,
            chestNumber: p.chest_number,
            reason: isPartRejected ? 'Participant absent' : 'Item absent'
          });
        }
      });
    });
    return missed;
  }, [unitData]);

  const unregisteredItems = useMemo(() => {
    if (!unitData || !allItems.length) return [];
    
    // Get all item IDs the unit has registered for
    const registeredItemIds = new Set<string>();
    unitData.participants.forEach((p: any) => {
      (p.registrations || []).forEach((r: any) => {
        registeredItemIds.add(r.item_id);
      });
    });

    // Filter all festival items to find the ones not registered
    return allItems.filter((i: any) => !registeredItemIds.has(i.id));
  }, [unitData, allItems]);

  if (profileQuery.isLoading || itemsQuery.isLoading) {
    return (
      <View style={styles.screen}>
        <LinearGradient
          colors={['#030F26', '#021E1B', '#02241F']}
          start={{ x: 0.1, y: 0.1 }}
          end={{ x: 0.9, y: 0.9 }}
          style={styles.gradientBgCenter}
        >
          <ActivityIndicator color={palette.blue} size="large" />
          <Text style={styles.centerText}>Loading missing items...</Text>
        </LinearGradient>
      </View>
    );
  }

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
            <Text style={styles.topBackText}>Back to Unit Profile</Text>
          </TouchableOpacity>

          <View style={[
            styles.header,
            isDesktop && styles.headerDesktop,
            {
              ...Platform.select({
                web: { 
                  boxShadow: '0 15px 35px rgba(0, 0, 0, 0.7), 0 5px 25px rgba(239, 68, 68, 0.15)',
                  backdropFilter: isMobile ? 'none' : 'blur(16px)'
                },
                default: { shadowColor: palette.red, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 12 }
              }) as any
            }
          ]}>
            <View style={styles.headerTextContainer}>
              <Text style={[styles.title, isMobile && styles.titleMobile]}>Absentee & Missing Items</Text>
              <Text style={styles.subtitle}>{unitData?.name}</Text>
            </View>
          </View>

          <View style={styles.tabsContainer}>
            <TouchableOpacity 
              style={[styles.tab, activeTab === 'missed' && styles.activeTabMissed]}
              onPress={() => setActiveTab('missed')}
            >
              <AlertCircle size={18} color={activeTab === 'missed' ? palette.red : palette.muted} />
              <Text style={[styles.tabText, activeTab === 'missed' && { color: palette.red }]}>
                Missed Malsaram ({missedRegistrations.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.tab, activeTab === 'unregistered' && styles.activeTabUnreg]}
              onPress={() => setActiveTab('unregistered')}
            >
              <FileQuestion size={18} color={activeTab === 'unregistered' ? palette.orange : palette.muted} />
              <Text style={[styles.tabText, activeTab === 'unregistered' && { color: palette.orange }]}>
                Aalillaththa Malsaram ({unregisteredItems.length})
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.listContainer}>
            {activeTab === 'missed' && (
              <View style={styles.list}>
                {missedRegistrations.length === 0 ? (
                  <View style={styles.emptyState}>
                    <AlertCircle size={48} color={palette.muted} />
                    <Text style={styles.emptyStateText}>No missed items found!</Text>
                    <Text style={styles.emptyStateSub}>All verified participants have attended their items.</Text>
                  </View>
                ) : (
                  missedRegistrations.map((reg: any, idx: number) => (
                    <View key={reg.id} style={[styles.listItem, idx === missedRegistrations.length - 1 && { borderBottomWidth: 0 }]}>
                      <View style={[styles.iconContainer, { backgroundColor: palette.softRed, borderColor: palette.borderRed }]}>
                        <AlertCircle size={20} color={palette.red} />
                      </View>
                      <View style={styles.itemMain}>
                        <Text style={styles.itemName}>{reg.item.name_ml || reg.item.name}</Text>
                        <View style={styles.itemMeta}>
                          <Text style={styles.itemMetaText}>{reg.participantName}</Text>
                          <Text style={styles.itemMetaDot}>•</Text>
                          <Text style={styles.itemMetaText}>Chest {reg.chestNumber}</Text>
                        </View>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: palette.softRed, borderColor: palette.borderRed }]}>
                        <Text style={[styles.statusBadgeText, { color: palette.red }]}>{reg.reason}</Text>
                      </View>
                    </View>
                  ))
                )}
              </View>
            )}

            {activeTab === 'unregistered' && (
              <View style={styles.list}>
                {unregisteredItems.length === 0 ? (
                  <View style={styles.emptyState}>
                    <FileQuestion size={48} color={palette.muted} />
                    <Text style={styles.emptyStateText}>No unregistered items!</Text>
                    <Text style={styles.emptyStateSub}>This unit has participated in all available items.</Text>
                  </View>
                ) : (
                  <View>
                    <View style={styles.infoBanner}>
                      <Info size={16} color={palette.blue} />
                      <Text style={styles.infoBannerText}>These are items where no participant from {unitData?.name} is registered.</Text>
                    </View>
                    {unregisteredItems.map((item: any, idx: number) => (
                      <View key={item.id} style={[styles.listItem, idx === unregisteredItems.length - 1 && { borderBottomWidth: 0 }]}>
                        <View style={[styles.iconContainer, { backgroundColor: palette.softOrange, borderColor: palette.borderOrange }]}>
                          <FileQuestion size={20} color={palette.orange} />
                        </View>
                        <View style={styles.itemMain}>
                          <Text style={styles.itemName}>{item.item_name_ml || item.item_name_en}</Text>
                          <View style={styles.itemMeta}>
                            <Text style={styles.itemMetaText}>
                              {(item.category_codes || []).join(', ')}
                            </Text>
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
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
  header: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    padding: 24,
    marginBottom: 20,
  },
  headerDesktop: {
    padding: 32,
  },
  headerTextContainer: {
    gap: 4,
  },
  title: {
    fontFamily: 'Poppins_900Black',
    color: '#FFFFFF',
    fontSize: 28,
  },
  titleMobile: {
    fontSize: 22,
  },
  subtitle: {
    fontFamily: 'Poppins_500Medium',
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 14,
  },
  tabsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    padding: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
    borderRadius: 10,
  },
  activeTabMissed: {
    backgroundColor: palette.softRed,
    borderColor: palette.borderRed,
    borderWidth: 1,
  },
  activeTabUnreg: {
    backgroundColor: palette.softOrange,
    borderColor: palette.borderOrange,
    borderWidth: 1,
  },
  tabText: {
    fontFamily: 'Poppins_700Bold',
    color: palette.muted,
    fontSize: 13,
  },
  listContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    overflow: 'hidden',
  },
  list: {
    width: '100%',
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    gap: 16,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemMain: {
    flex: 1,
  },
  itemName: {
    fontFamily: 'Poppins_700Bold',
    color: '#FFFFFF',
    fontSize: 15,
  },
  itemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  itemMetaText: {
    fontFamily: 'Poppins_500Medium',
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 12,
  },
  itemMetaDot: {
    color: 'rgba(255, 255, 255, 0.3)',
    fontSize: 12,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 10,
    textTransform: 'uppercase',
  },
  emptyState: {
    padding: 48,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyStateText: {
    fontFamily: 'Poppins_700Bold',
    color: '#FFFFFF',
    fontSize: 18,
  },
  emptyStateSub: {
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 13,
    textAlign: 'center',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 16,
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(59, 130, 246, 0.15)',
  },
  infoBannerText: {
    fontFamily: 'Poppins_500Medium',
    color: palette.blue,
    fontSize: 12,
    flex: 1,
  }
});
