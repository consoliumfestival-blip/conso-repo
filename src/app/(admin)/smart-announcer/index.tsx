import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable, ScrollView, Alert, TouchableOpacity } from 'react-native';
import { Stack } from 'expo-router';
import { RefreshCcw, Radio, Trophy, CheckCircle, QrCode, Copy, Share, ExternalLink, X, Users, Award } from 'lucide-react-native';
import { Modal, Platform } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { SsfButton } from '@/components/ui/SsfButton';
import { supabase } from '@/core/config/supabase';
import { useAuthStore } from '@/core/store/authStore';
import { useFestival } from '@/core/hooks/useFestival';
import { ui } from '@/constants/designSystem';


interface StrategicResult {
  result_id: string;
  item_name: string;
  suspense_score: number;
  recommended_order: number;
  new_1st_points: number;
  new_2nd_points: number;
  new_3rd_points: number;
  leader_name: string;
  is_public: boolean;
}

export default function SmartAnnouncerPage() {
  const { user, tenant_id } = useAuthStore();
  const { useActiveFestival } = useFestival();
  const { data: currentFestival, isLoading: festivalLoading } = useActiveFestival();
  const [results, setResults] = useState<StrategicResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);
  const [announcerToken, setAnnouncerToken] = useState<string | null>(null);
  const [generatingToken, setGeneratingToken] = useState(false);

  // Detail Modal State
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [detailedResults, setDetailedResults] = useState<any[]>([]);
  const [selectedItemName, setSelectedItemName] = useState('');

  // Team Filter State
  const [teams, setTeams] = useState<string[]>([]);
  const [selectedFilterTeam, setSelectedFilterTeam] = useState<string>('All');

  const fetchDetailedResults = async (itemId: string, itemName: string) => {
    setIsDetailsModalOpen(true);
    setLoadingDetails(true);
    setSelectedItemName(itemName);
    try {
      const { data, error } = await supabase
        .from('results')
        .select(`
          rank, 
          grade, 
          points_awarded, 
          items!inner(item_name_ml, category_codes), 
          registrations!inner(code_letter, participants(name), organisations(name))
        `)
        .eq('item_id', itemId)
        .order('rank', { ascending: true, nullsFirst: false })
        .order('total_score', { ascending: false });
      
      if (error) throw error;
      setDetailedResults(data || []);
    } catch (err) {
      console.error('Error fetching details:', err);
      Alert.alert('Error', 'Could not fetch detailed results.');
    } finally {
      setLoadingDetails(false);
    }
  };

  
  const handleGenerateToken = async () => {
    if (!currentFestival?.id || !tenant_id) return;
    setGeneratingToken(true);
    try {
      // Check if active token exists
      const { data: existing } = await supabase
        .from('announcer_tokens')
        .select('token')
        .eq('festival_id', currentFestival.id)
        .eq('is_active', true)
        .single();
        
      if (existing?.token) {
        setAnnouncerToken(existing.token);
      } else {
        // Generate new token (6 chars)
        const newToken = Math.random().toString(36).substring(2, 8).toUpperCase();
        const { error } = await supabase
          .from('announcer_tokens')
          .insert({
            tenant_id,
            festival_id: currentFestival.id,
            token: newToken,
            created_by: user?.id
          });
        if (error) throw error;
        setAnnouncerToken(newToken);
      }
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Could not generate announcer token.");
    } finally {
      setGeneratingToken(false);
    }
  };

  const openTokenModal = () => {
    setIsTokenModalOpen(true);
    handleGenerateToken();
  };

  const fetchQueue = async () => {
    if (!currentFestival || !tenant_id) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_strategic_publish_order', {
        p_festival_id: currentFestival.id,
        p_tenant_id: tenant_id
      });
      if (error) throw error;
      setResults(data || []);
    } catch (err: any) {
      console.error('Error fetching queue:', err);
      Alert.alert("Error", "Could not fetch the smart queue. Please check if the Suspense RPC is deployed.");
    } finally {
      setLoading(false);
    }
  };

  const fetchTeams = async () => {
    if (!tenant_id) return;
    try {
      const { data, error } = await supabase.from('organisations').select('name').eq('tenant_id', tenant_id).order('name');
      if (data) setTeams(data.map(t => t.name));
    } catch (e) {
      console.error('Error fetching teams:', e);
    }
  };

  useEffect(() => {
    fetchQueue();
    fetchTeams();
  }, [currentFestival]);

  const displayedResults = selectedFilterTeam === 'All' 
    ? results 
    : results.filter(r => r.leader_name === selectedFilterTeam);

  
  const handlePublish = async (resultId: string, itemName: string) => {
    Alert.alert(
      "Publish Result",
      `Are you sure you want to publish the result for ${itemName}? This will immediately update the public leaderboard.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Publish",
          style: "default",
          onPress: async () => {
            setPublishing(resultId);
            try {
              const { error } = await supabase
                .from('results')
                .update({ public_visible: true, published_at: new Date().toISOString() })
                .eq('item_id', resultId);
              
              if (error) throw error;
              
              Alert.alert("Success", "Result published successfully!");
              fetchQueue();
            } catch (err) {
              console.error(err);
              Alert.alert("Error", "Failed to publish result.");
            } finally {
              setPublishing(null);
            }
          }
        }
      ]
    );
  };

  const handleHide = async (resultId: string, itemName: string) => {
    Alert.alert(
      "Hide Result",
      `Are you sure you want to hide the result for ${itemName} from the public leaderboard?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Hide",
          style: "destructive",
          onPress: async () => {
            setPublishing(resultId);
            try {
              const { error } = await supabase
                .from('results')
                .update({ public_visible: false })
                .eq('item_id', resultId);
              
              if (error) throw error;
              
              Alert.alert("Success", "Result hidden successfully!");
              fetchQueue();
            } catch (err) {
              console.error(err);
              Alert.alert("Error", "Failed to hide result.");
            } finally {
              setPublishing(null);
            }
          }
        }
      ]
    );
  };
  

  return (
    <>
      <Stack.Screen options={{ title: 'Smart Announcer' }} />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Smart Announcer Queue</Text>
            <Text style={styles.subtitle}>Strategically publish results to maintain leaderboard suspense</Text>
          </View>
          <TouchableOpacity 
            style={[styles.refreshBtn, loading && styles.disabledBtn]} 
            onPress={fetchQueue}
            disabled={loading}
          >
            <RefreshCcw size={20} color="white" />
            <Text style={styles.refreshText}>Recalculate</Text>
          </TouchableOpacity>
        </View>

        {/* Team Filter */}
        {teams.length > 0 && (
          <View style={{ marginVertical: 16 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingBottom: 8 }}>
              <TouchableOpacity 
                style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: selectedFilterTeam === 'All' ? ui.colors.primary : '#f1f5f9' }} 
                onPress={() => setSelectedFilterTeam('All')}
              >
                <Text style={{ fontWeight: '600', color: selectedFilterTeam === 'All' ? 'white' : '#475569' }}>All Teams</Text>
              </TouchableOpacity>
              {teams.map(team => (
                <TouchableOpacity 
                  key={team} 
                  style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: selectedFilterTeam === team ? ui.colors.primary : '#f1f5f9' }} 
                  onPress={() => setSelectedFilterTeam(team)}
                >
                  <Text style={{ fontWeight: '600', color: selectedFilterTeam === team ? 'white' : '#475569' }}>{team}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {loading ? (
          <View style={styles.loader}>
            <ActivityIndicator size="large" color={ui.colors.primary} />
            <Text style={styles.loaderText}>Analyzing suspense impact...</Text>
          </View>
        ) : results.length === 0 ? (
          <View style={styles.loader}>
            <Radio size={48} color={ui.colors.textSubtle} />
            <Text style={[styles.title, { marginTop: 16 }]}>Queue Empty</Text>
            <Text style={styles.subtitle}>No pending results to announce. All approved results have been published.</Text>
          </View>
        ) : displayedResults.length === 0 ? (
          <View style={styles.loader}>
            <Radio size={48} color={ui.colors.textSubtle} />
            <Text style={[styles.title, { marginTop: 16, color: '#b45309' }]}>No Matches Found</Text>
            <Text style={styles.subtitle}>നിലവിൽ {selectedFilterTeam}-നെ ഒന്നാം സ്ഥാനത്ത് എത്തിക്കാൻ കഴിയുന്ന പബ്ലിഷ് ചെയ്യാത്ത മത്സര ഫലങ്ങൾ ലഭ്യമല്ല.</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {displayedResults.map((res, index) => { if (res.is_public) return null;
                const isTop = index === 0;
                return (
                  <View key={res.result_id} style={[styles.row, isTop && styles.topRow]}>
                    <TouchableOpacity 
                      style={{ flex: 1, flexDirection: 'row', gap: 16, flexWrap: 'wrap' }} 
                      onPress={() => fetchDetailedResults(res.result_id, res.item_name)}
                    >
                      <View style={styles.rowLeft}>
                      {isTop && (
                        <View style={styles.badgeSmall}>
                          <Text style={styles.badgeTextSmall}>? Recommended Next</Text>
                        </View>
                      )}
                      <Text style={styles.itemName}>{res.item_name}</Text>
                      <Text style={styles.orderTextSmall}>Order: {res.recommended_order} � Suspense Score: {res.suspense_score}</Text>
                    </View>
                    
                    <View style={styles.rowMiddle}>
                      <Text style={styles.impactTitleSmall}>Projected Leaderboard</Text>
                      <View style={styles.statsCompact}>
                        <Text style={styles.statCompactText}><Trophy size={14} color="#fbbf24" /> 1st: {res.new_1st_points}</Text>
                        <Text style={styles.statCompactText}><Trophy size={14} color="#64748b" /> 2nd: {res.new_2nd_points}</Text>
                        <Text style={styles.statCompactText}><Trophy size={14} color="#b45309" /> 3rd: {res.new_3rd_points}</Text>
                      </View>
                      <Text style={styles.leaderTextSmall}>
                        Leader: <Text style={styles.leaderHighlight}>{res.leader_name}</Text>
                      </Text>
                    </View>

                    </TouchableOpacity>

                    <View style={styles.rowRight}>
                      <TouchableOpacity 
                        style={[styles.publishBtnSmall, publishing === res.result_id && styles.disabledBtn]}
                        onPress={() => handlePublish(res.result_id, res.item_name)}
                        disabled={publishing === res.result_id}
                      >
                        {publishing === res.result_id ? (
                          <ActivityIndicator size="small" color="white" />
                        ) : (
                          <>
                            <CheckCircle size={16} color="white" />
                            <Text style={styles.publishTextSmall}>Announce</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
          </View>
        )}
      
      {/* Result Details Modal */}
      <Modal visible={isDetailsModalOpen} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <View style={{ width: '100%', maxWidth: 500, backgroundColor: 'white', borderRadius: 16, padding: 0, maxHeight: '80%' }}>
            
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}>
              <View>
                <Text style={{ fontSize: 20, fontWeight: '700', color: '#1e293b' }}>{selectedItemName}</Text>
                <Text style={{ fontSize: 13, color: '#64748b' }}>Detailed Results Preview</Text>
              </View>
              <TouchableOpacity onPress={() => setIsDetailsModalOpen(false)}>
                <X size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            {loadingDetails ? (
              <View style={{ padding: 48, alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#0f766e" />
                <Text style={{ marginTop: 16, color: '#64748b' }}>Loading details...</Text>
              </View>
            ) : (
              <ScrollView style={{ padding: 20 }}>
                {detailedResults.map((r, i) => (
                  <View key={i} style={{ 
                    flexDirection: 'row', 
                    padding: 16, 
                    backgroundColor: i === 0 ? '#f0fdf4' : i === 1 ? '#f8fafc' : i === 2 ? '#fffbeb' : '#ffffff',
                    borderWidth: 1,
                    borderColor: i === 0 ? '#bbf7d0' : '#e2e8f0',
                    borderRadius: 12,
                    marginBottom: 12
                  }}>
                    <View style={{ marginRight: 16, alignItems: 'center', justifyContent: 'center', width: 40 }}>
                      {r.rank ? (
                        <>
                          <Award size={24} color={r.rank === 1 ? '#eab308' : r.rank === 2 ? '#94a3b8' : '#cd7f32'} />
                          <Text style={{ fontWeight: '800', fontSize: 16, color: '#1e293b' }}>{r.rank}</Text>
                        </>
                      ) : (
                        <Text style={{ fontWeight: '600', fontSize: 14, color: '#94a3b8' }}>-</Text>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '700', fontSize: 16, color: '#1e293b', marginBottom: 4 }}>
                        {Array.isArray(r.registrations?.participants) 
                          ? r.registrations.participants.map((p: any) => p.name).join(', ') 
                          : r.registrations?.participants?.name || 'Unknown'}
                      </Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                        <Text style={{ fontSize: 13, color: '#64748b', fontWeight: '500' }}>
                          Code: {r.registrations?.code_letter || 'N/A'}
                        </Text>
                        <Text style={{ fontSize: 13, color: '#64748b' }}>•</Text>
                        <Text style={{ fontSize: 13, color: '#0f766e', fontWeight: '600' }}>
                          {r.registrations?.organisations?.name || 'Unknown Team'}
                        </Text>
                        {r.grade && (
                          <>
                            <Text style={{ fontSize: 13, color: '#64748b' }}>•</Text>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: '#1e293b' }}>Grade {r.grade}</Text>
                          </>
                        )}
                        {r.items?.category_codes && (
                          <>
                            <Text style={{ fontSize: 13, color: '#64748b' }}>•</Text>
                            <Text style={{ fontSize: 13, color: '#64748b' }}>
                              {Array.isArray(r.items.category_codes) ? r.items.category_codes.join(', ') : String(r.items.category_codes)}
                            </Text>
                          </>
                        )}
                      </View>
                    </View>
                  </View>
                ))}
                {detailedResults.length === 0 && (
                  <Text style={{ textAlign: 'center', color: '#64748b', padding: 20 }}>No result records found.</Text>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* QR Code Modal */}
      <Modal visible={isTokenModalOpen} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <View style={{ width: '100%', maxWidth: 400, backgroundColor: 'white', borderRadius: 16, padding: 24 }}>
            <Text style={{ fontSize: 20, fontFamily: 'Poppins_900Black', color: '#1e293b', marginBottom: 16 }}>Announcer Access</Text>
            
            {generatingToken ? (
              <ActivityIndicator size="large" color="#0f766e" style={{ marginVertical: 32 }} />
            ) : announcerToken ? (
              <View style={{ alignItems: 'center' }}>
                <View style={{ padding: 16, backgroundColor: 'white', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 16 }}>
                  <QRCode
                    value={typeof window !== 'undefined' ? `${window.location.origin}/announcer/${announcerToken}` : `https://sahi-app.com/announcer/${announcerToken}`}
                    size={160}
                    color="#0f766e"
                    backgroundColor="white"
                  />
                </View>
                <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>Access Code</Text>
                <Text style={{ fontFamily: 'Poppins_900Black', fontSize: 28, color: '#0f766e', letterSpacing: 4, marginBottom: 24 }}>{announcerToken}</Text>
                
                <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: '#64748b', textAlign: 'center', marginBottom: 24 }}>
                  Scan this QR code or use the link to access the Announcer Portal. No login required.
                </Text>
              </View>
            ) : null}
            
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
              <SsfButton label="Close" variant="outline" onPress={() => setIsTokenModalOpen(false)} />
            </View>
          </View>
        </View>
      </Modal>
  
</ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    gap: 24,
    maxWidth: 1000,
    marginHorizontal: 'auto',
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: ui.colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: ui.colors.textMuted,
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: ui.colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 8,
  },
  disabledBtn: {
    opacity: 0.7,
  },
  refreshText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
  loader: {
    padding: 48,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loaderText: {
    color: ui.colors.textMuted,
    fontSize: 16,
  },
  list: {
    gap: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: ui.colors.border,
    shadowColor: ui.shadow.shadowColor,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
    gap: 16,
    flexWrap: 'wrap',
  },
  topRow: {
    borderColor: ui.colors.primary,
    borderWidth: 2,
  },
  rowLeft: {
    flex: 1,
    minWidth: 200,
  },
  badgeSmall: {
    backgroundColor: ui.colors.primary,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginBottom: 8,
  },
  badgeTextSmall: {
    color: 'white',
    fontWeight: '700',
    fontSize: 10,
    textTransform: 'uppercase',
  },
  itemName: {
    fontSize: 18,
    fontWeight: '700',
    color: ui.colors.text,
    marginBottom: 4,
  },
  orderTextSmall: {
    fontSize: 12,
    fontWeight: '500',
    color: ui.colors.textMuted,
  },
  rowMiddle: {
    flex: 2,
    minWidth: 250,
    backgroundColor: ui.colors.surfaceMuted,
    padding: 12,
    borderRadius: 8,
  },
  impactTitleSmall: {
    fontSize: 12,
    fontWeight: '600',
    color: ui.colors.textMuted,
    marginBottom: 8,
  },
  statsCompact: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  statCompactText: {
    fontSize: 13,
    fontWeight: '600',
    color: ui.colors.text,
  },
  leaderTextSmall: {
    fontSize: 12,
    color: ui.colors.textMuted,
  },
  leaderHighlight: {
    fontWeight: '700',
    color: ui.colors.text,
  },
  rowRight: {
    justifyContent: 'center',
  },
  publishBtnSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ui.colors.text,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 8,
  },
  publishTextSmall: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
});

