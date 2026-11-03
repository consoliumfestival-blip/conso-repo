import React from 'react';
import { ActivityIndicator, Platform, ScrollView, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Activity, Bell, ChevronRight, Globe, Layers, LogOut, Settings, Shield, Trophy, Users, FileText } from 'lucide-react-native';
import { useAuthStore } from '../../core/store/authStore';
import { useSuperAdmin } from '../../core/hooks/useSuperAdmin';
import { ConsoliumLogo } from '@/components/ui/ConsoliumLogo';

// These colors belong only to the superadmin landing page. Core appearance
// settings continue to be provided by the existing appearance provider.
const C = { bg: '#F3F8F7', surface: '#FFFFFF', border: '#D8E4DF', primary: '#0F766E', deep: '#113531', text: '#142C2A', muted: '#58716D', soft: '#E7F3F0', danger: '#B42318' };

export default function SuperadminDashboard() {
  const router = useRouter();
  const { logout, user } = useAuthStore();
  const { useStats } = useSuperAdmin();
  const { data: statsData, isLoading: loadingStats } = useStats();
  const { width } = useWindowDimensions();
  const compact = width < 640;
  const stats = statsData || { orgs: 0, tenants: 0 };

  const handleLogout = async () => {
    if (Platform.OS === 'web' && !window.confirm('Are you sure you want to log out?')) return;
    await logout();
    router.replace('/(public)');
  };

  const cards = [
    { label: 'Organisations', value: stats.orgs, icon: Layers },
    { label: 'Users', value: stats.tenants, icon: Users },
    { label: 'System', value: 'Healthy', icon: Activity },
  ];
  const modules = [
    { title: 'Organisation Hierarchy', desc: 'Manage Units, Sectors & Divisions globally', icon: Layers, route: '/(super)/organisations' },
    { title: 'Tenant Accounts', desc: 'View and configure all tenant settings', icon: Globe, route: '/(super)/tenants' },
    { title: 'System Logs', desc: 'Monitor application and server activity', icon: FileText, route: null },
    { title: 'Festival Settings', desc: 'Manage global scoring rules and items', icon: Settings, route: null },
    { title: 'Appearance', desc: 'Personalize Core and Stage Management on this device', icon: Settings, route: '/(super)/appearance' },
    { title: 'Communication Center', desc: 'Send notifications across all tenants', icon: Bell, route: null },
    { title: 'Leaderboard Management', desc: 'Control visibility and calculate results', icon: Trophy, route: null },
  ];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={{ backgroundColor: C.deep, paddingHorizontal: compact ? 16 : 28, paddingTop: Platform.OS === 'web' ? 28 : 56, paddingBottom: 24 }}>
        <View style={{ width: '100%', maxWidth: 1120, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
            <ConsoliumLogo size={42} borderRadius={10} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: '#B9D4CB', fontFamily: 'Poppins_600SemiBold', fontSize: 11 }}>SUPERADMIN</Text>
              <Text style={{ color: '#FFFFFF', fontFamily: 'Poppins_700Bold', fontSize: 21, lineHeight: 27 }}>Master Panel</Text>
            </View>
          </View>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Log out" onPress={handleLogout} style={{ minWidth: 44, minHeight: 44, borderWidth: 1, borderColor: '#53786E', borderRadius: 9, alignItems: 'center', justifyContent: 'center' }}><LogOut size={19} color="#FFFFFF" /></TouchableOpacity>
        </View>
        <View style={{ width: '100%', maxWidth: 1120, alignSelf: 'center', marginTop: 14 }}>
          <Text numberOfLines={2} style={{ color: '#D9EAE4', fontFamily: 'Poppins_400Regular', fontSize: 12 }}>{user?.email ?? 'Ultimate Admin'}</Text>
        </View>
      </View>
      <View style={{ width: '100%', maxWidth: 1120, alignSelf: 'center', paddingHorizontal: compact ? 16 : 28, paddingTop: 22 }}>
        <Text style={{ color: C.text, fontFamily: 'Poppins_700Bold', fontSize: 15, marginBottom: 10 }}>System Overview</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 }}>
          {cards.map(({ label, value, icon: Icon }) => (
            <View key={label} style={{ flexGrow: 1, flexBasis: compact ? '45%' : '30%', backgroundColor: C.surface, borderColor: C.border, borderWidth: 1, borderRadius: 10, padding: 14, minHeight: 98 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}><Icon size={17} color={C.primary} /><Text style={{ color: C.muted, fontFamily: 'Poppins_600SemiBold', fontSize: 11 }}>{label}</Text></View>
              {loadingStats && label !== 'System' ? <ActivityIndicator size="small" color={C.primary} style={{ alignSelf: 'flex-start' }} /> : <Text style={{ color: C.text, fontFamily: 'Poppins_700Bold', fontSize: 21 }}>{value}</Text>}
            </View>
          ))}
        </View>
        <Text style={{ color: C.text, fontFamily: 'Poppins_700Bold', fontSize: 15, marginBottom: 10 }}>System Modules</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {modules.map(({ title, desc, icon: Icon, route }) => (
            <TouchableOpacity key={title} accessibilityRole="button" accessibilityLabel={route ? title : `${title}, coming soon`} accessibilityState={{ disabled: !route }} disabled={!route} onPress={() => route && router.push(route as any)} activeOpacity={0.75} style={{ width: compact ? '100%' : '49%', flexGrow: compact ? 0 : 1, minHeight: 92, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, opacity: route ? 1 : 0.7 }}>
              <View style={{ width: 42, height: 42, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: C.soft }}><Icon size={20} color={C.primary} /></View>
              <View style={{ flex: 1, minWidth: 0 }}><Text style={{ color: C.text, fontFamily: 'Poppins_700Bold', fontSize: 13 }}>{title}{!route ? '  ·  Coming soon' : ''}</Text><Text style={{ color: C.muted, fontFamily: 'Poppins_400Regular', fontSize: 11, lineHeight: 17, marginTop: 3 }}>{desc}</Text></View>
              {route ? <ChevronRight size={18} color={C.muted} /> : null}
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ marginTop: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}><Shield size={15} color={C.primary} /><Text style={{ flex: 1, color: C.muted, fontFamily: 'Poppins_400Regular', fontSize: 11, lineHeight: 17 }}>Changes here affect all tenants globally. Proceed with caution.</Text></View>
      </View>
    </ScrollView>
  );
}
