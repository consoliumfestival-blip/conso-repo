
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { RefreshCcw, Radio, Trophy, CheckCircle, ShieldAlert } from 'lucide-react-native';
import { supabase } from '@/core/config/supabase';

export default function AnnouncerPortal() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [festivalData, setFestivalData] = useState<any>(null);

  const fetchQueue = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      // 1. Verify token and get festival_id
      const { data: tokenData, error: tokenError } = await supabase
        .from('announcer_tokens')
        .select('festival_id, tenant_id, is_active')
        .eq('token', token)
        .eq('is_active', true)
        .single();
        
      if (tokenError || !tokenData) {
        throw new Error("Invalid or expired token");
      }
      
      // 2. Fetch festival name
      const { data: festData } = await supabase
        .from('festival_calendar')
        .select('custom_name, level')
        .eq('id', tokenData.festival_id)
        .single();
        
      setFestivalData(festData);

      // 3. Fetch queue using the existing RPC
      const { data, error } = await supabase.rpc('get_strategic_publish_order', {
        p_festival_id: tokenData.festival_id,
        p_tenant_id: tokenData.tenant_id
      });
      
      if (error) throw error;
      setResults(data || []);
    } catch (err: any) {
      console.error('Error fetching announcer portal:', err);
      setError(err.message || "Failed to load announcer data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, [token]);

  const toggleVisibility = async (resultId: string, itemName: string, isPublic: boolean) => {
    const action = isPublic ? "Publish" : "Hide";
    Alert.alert(
      `${action} Result`,
      `Are you sure you want to ${action.toLowerCase()} the result for ${itemName}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: action,
          style: isPublic ? "default" : "destructive",
          onPress: async () => {
            setPublishing(resultId);
            try {
              const { error } = await supabase.rpc('toggle_announcer_result_visibility', {
                p_token: token,
                p_item_id: resultId,
                p_is_public: isPublic
              });
              
              if (error) throw error;
              
              Alert.alert("Success", `Result ${action.toLowerCase()}ed successfully!`);
              fetchQueue();
            } catch (err: any) {
              console.error(err);
              Alert.alert("Error", `Failed to ${action.toLowerCase()} result. ${err.message}`);
            } finally {
              setPublishing(null);
            }
          }
        }
      ]
    );
  };

  if (error) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ShieldAlert size={48} color="#ef4444" />
        <Text style={[styles.title, { marginTop: 16, color: '#ef4444' }]}>Access Denied</Text>
        <Text style={styles.subtitle}>{error}</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Announcer Portal', headerShown: false }} />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Announcer Portal</Text>
            <Text style={styles.subtitle}>{festivalData?.custom_name || 'Festival'} � Live Results</Text>
          </View>
          <TouchableOpacity 
            style={[styles.refreshBtn, loading && styles.disabledBtn]} 
            onPress={fetchQueue}
            disabled={loading}
          >
            <RefreshCcw size={20} color="white" />
            <Text style={styles.refreshText}>Refresh</Text>
          </TouchableOpacity>
        </View>

        {loading && !results.length ? (
          <View style={styles.loader}>
            <ActivityIndicator size="large" color="#0f766e" />
            <Text style={styles.loaderText}>Loading queue...</Text>
          </View>
        ) : results.length === 0 ? (
          <View style={styles.loader}>
            <Radio size={48} color="#94a3b8" />
            <Text style={[styles.title, { marginTop: 16 }]}>Queue Empty</Text>
            <Text style={styles.subtitle}>No approved results available.</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {results.map((item, index) => {
              const isHidden = !item.is_public;
              return (
                <View key={item.result_id} style={[styles.card, isHidden ? styles.cardHighlight : styles.cardDim]}>
                  <View style={styles.cardLeft}>
                    <View style={[styles.badge, isHidden ? styles.badgeActive : styles.badgeInactive]}>
                      {isHidden ? (
                        <Text style={styles.badgeText}># {index + 1} Queue</Text>
                      ) : (
                        <Text style={styles.badgeTextInactive}>Published</Text>
                      )}
                    </View>
                    <Text style={styles.itemName}>{item.item_name}</Text>
                    
                    <View style={styles.impactBox}>
                      <Trophy size={14} color="#64748b" />
                      <Text style={styles.impactText}>Top: {item.leader_name}</Text>
                    </View>
                  </View>

                  <View style={styles.cardRight}>
                    {item.is_public ? (
                      <TouchableOpacity 
                        style={[styles.publishBtn, { backgroundColor: '#ef4444' }, publishing === item.result_id && styles.disabledBtn]}
                        onPress={() => toggleVisibility(item.result_id, item.item_name, false)}
                        disabled={publishing === item.result_id}
                      >
                        {publishing === item.result_id ? (
                          <ActivityIndicator color="white" size="small" />
                        ) : (
                          <>
                            <Radio size={16} color="white" />
                            <Text style={styles.publishBtnText}>Hide</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity 
                        style={[styles.publishBtn, publishing === item.result_id && styles.disabledBtn]}
                        onPress={() => toggleVisibility(item.result_id, item.item_name, true)}
                        disabled={publishing === item.result_id}
                      >
                        {publishing === item.result_id ? (
                          <ActivityIndicator color="white" size="small" />
                        ) : (
                          <>
                            <CheckCircle size={16} color="white" />
                            <Text style={styles.publishBtnText}>Publish</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    backgroundColor: '#f8fafc',
    flexGrow: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32,
    backgroundColor: 'white',
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  title: {
    fontFamily: 'Poppins_900Black',
    fontSize: 24,
    color: '#0f172a',
  },
  subtitle: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 14,
    color: '#64748b',
    marginTop: 4,
  },
  refreshBtn: {
    backgroundColor: '#0f766e',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  disabledBtn: {
    opacity: 0.7,
  },
  refreshText: {
    fontFamily: 'Poppins_700Bold',
    color: 'white',
    marginLeft: 8,
  },
  loader: {
    padding: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loaderText: {
    fontFamily: 'Poppins_400Regular',
    color: '#64748b',
    marginTop: 16,
  },
  list: {
    gap: 16,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardHighlight: {
    borderLeftWidth: 4,
    borderLeftColor: '#f59e0b',
  },
  cardDim: {
    opacity: 0.7,
  },
  cardLeft: {
    flex: 1,
  },
  cardRight: {
    marginLeft: 16,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 8,
  },
  badgeActive: {
    backgroundColor: '#fef3c7',
  },
  badgeInactive: {
    backgroundColor: '#f1f5f9',
  },
  badgeText: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 10,
    color: '#b45309',
    textTransform: 'uppercase',
  },
  badgeTextInactive: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 10,
    color: '#64748b',
    textTransform: 'uppercase',
  },
  itemName: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 18,
    color: '#1e293b',
    marginBottom: 8,
  },
  impactBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  impactText: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 12,
    color: '#475569',
    marginLeft: 6,
  },
  publishBtn: {
    backgroundColor: '#0f766e',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
    minWidth: 140,
    justifyContent: 'center',
  },
  publishBtnText: {
    fontFamily: 'Poppins_700Bold',
    color: 'white',
    marginLeft: 8,
    fontSize: 14,
  }
});
