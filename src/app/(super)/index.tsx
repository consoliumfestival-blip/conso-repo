import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Shield, Layers, Users, LogOut, FileText, Globe, ChevronRight, Activity, Settings, Bell, Trophy } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInUp, FadeInDown } from 'react-native-reanimated';
import { useAuthStore } from '../../core/store/authStore';
import { useSuperAdmin } from '../../core/hooks/useSuperAdmin';

// ─── Midnight Blue Theme ────────────────────────────────────────────
// bg:       #0B1524  surface: #111E35  border: #1E3A5F
// accent:   #FBBF24  text:    #E2E8F0  muted:  #64748B
// ────────────────────────────────────────────────────────────────────

interface StatItem {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
}

export default function SuperadminDashboard() {
  const router = useRouter();
  const { logout, user } = useAuthStore();
  const { useStats } = useSuperAdmin();
  const { data: statsData, isLoading: loadingStats } = useStats();

  const stats = statsData || { orgs: 0, tenants: 0 };

  const handleLogout = async () => {
    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to log out?')) {
        await logout();
        router.replace('/(public)');
      }
    } else {
      await logout();
      router.replace('/(public)');
    }
  };

  const statCards: StatItem[] = [
    {
      label: 'Organisations',
      value: loadingStats ? '—' : stats.orgs,
      icon: <Layers size={22} color="#FBBF24" />,
      color: '#1E3A5F',
    },
    {
      label: 'Users',
      value: loadingStats ? '—' : stats.tenants,
      icon: <Users size={22} color="#34D399" />,
      color: '#0D2D1F',
    },
    {
      label: 'System',
      value: 'Healthy',
      icon: <Activity size={22} color="#818CF8" />,
      color: '#1E1B4B',
    },
  ];

  const modules = [
    {
      title: 'Organisation Hierarchy',
      desc: 'Manage Units, Sectors & Divisions globally',
      icon: <Layers size={26} color="#FBBF24" />,
      route: '/(super)/organisations',
      badge: null,
      delay: 100,
    },
    {
      title: 'Tenant Accounts',
      desc: 'View and configure all tenant settings',
      icon: <Globe size={26} color="#34D399" />,
      route: '/(super)/tenants',
      badge: null,
      delay: 200,
    },
    {
      title: 'System Logs',
      desc: 'Monitor application and server activity',
      icon: <FileText size={26} color="#818CF8" />,
      route: null,
      badge: 'Soon',
      delay: 300,
    },
    {
      title: 'Festival Settings',
      desc: 'Manage global scoring rules and items',
      icon: <Settings size={26} color="#38BDF8" />,
      route: '/(admin)/settings',
      badge: null,
      delay: 400,
    },
    {
      title: 'Communication Center',
      desc: 'Send notifications across all tenants',
      icon: <Bell size={26} color="#F472B6" />,
      route: '/(admin)/communication',
      badge: null,
      delay: 500,
    },
    {
      title: 'Leaderboard Management',
      desc: 'Control visibility and calculate results',
      icon: <Trophy size={26} color="#FBBF24" />,
      route: '/(admin)/settings/leaderboard',
      badge: null,
      delay: 600,
    },
  ];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#0B1524' }}
      contentContainerStyle={{ paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Header ── */}
      <LinearGradient
        colors={['#0B1524', '#111E35', '#0B1524']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          paddingTop: 64,
          paddingBottom: 32,
          paddingHorizontal: 24,
          borderBottomWidth: 1,
          borderBottomColor: '#1E3A5F',
          marginBottom: 24,
        }}
      >
        <Animated.View entering={FadeInDown.duration(600).springify()}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {/* Gold shield badge */}
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 14,
                  backgroundColor: 'rgba(251,191,36,0.12)',
                  borderWidth: 1,
                  borderColor: 'rgba(251,191,36,0.3)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 14,
                }}
              >
                <Shield size={26} color="#FBBF24" />
              </View>
              <View>
                <Text style={{ color: '#94A3B8', fontFamily: 'Poppins_400Regular', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 2 }}>
                  Superadmin
                </Text>
                <Text style={{ color: '#E2E8F0', fontFamily: 'Poppins_900Black', fontSize: 26, lineHeight: 30 }}>
                  Master Panel
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={handleLogout}
              style={{
                padding: 12,
                backgroundColor: 'rgba(239,68,68,0.1)',
                borderRadius: 14,
                borderWidth: 1,
                borderColor: 'rgba(239,68,68,0.25)',
              }}
            >
              <LogOut size={20} color="#F87171" />
            </TouchableOpacity>
          </View>

          {/* User pill */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginTop: 20,
              backgroundColor: 'rgba(30,58,95,0.5)',
              borderRadius: 30,
              paddingHorizontal: 14,
              paddingVertical: 8,
              alignSelf: 'flex-start',
              borderWidth: 1,
              borderColor: '#1E3A5F',
            }}
          >
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: '#34D399',
                marginRight: 8,
              }}
            />
            <Text style={{ color: '#94A3B8', fontFamily: 'Poppins_400Regular', fontSize: 12 }}>
              {user?.email ?? 'Ultimate Admin'}
            </Text>
          </View>
        </Animated.View>
      </LinearGradient>

      <View style={{ paddingHorizontal: 20 }}>
        {/* ── Stats ── */}
        <Animated.View entering={FadeInUp.duration(500).delay(50).springify()}>
          <Text style={{ color: '#475569', fontFamily: 'Poppins_700Bold', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>
            System Overview
          </Text>
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 28 }}>
            {statCards.map((stat, i) => (
              <View
                key={i}
                style={{
                  flex: 1,
                  backgroundColor: stat.color,
                  borderRadius: 10,
                  padding: 14,
                  borderWidth: 1,
                  borderColor: '#1E3A5F',
                }}
              >
                <View style={{ marginBottom: 10 }}>{stat.icon}</View>
                {loadingStats && stat.label !== 'System' ? (
                  <ActivityIndicator size="small" color="#FBBF24" style={{ alignSelf: 'flex-start', marginBottom: 6 }} />
                ) : (
                  <Text style={{ color: '#E2E8F0', fontFamily: 'Poppins_900Black', fontSize: 22, lineHeight: 26 }}>
                    {stat.value}
                  </Text>
                )}
                <Text style={{ color: '#64748B', fontFamily: 'Poppins_400Regular', fontSize: 11, marginTop: 2 }}>
                  {stat.label}
                </Text>
              </View>
            ))}
          </View>
        </Animated.View>

        {/* ── Modules ── */}
        <Text style={{ color: '#475569', fontFamily: 'Poppins_700Bold', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>
          System Modules
        </Text>

        {modules.map((mod, i) => (
          <Animated.View key={i} entering={FadeInUp.duration(600).delay(mod.delay).springify()}>
            <TouchableOpacity
              activeOpacity={mod.route ? 0.75 : 1}
              onPress={() => mod.route && router.push(mod.route as any)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: '#111E35',
                borderRadius: 10,
                padding: 18,
                marginBottom: 12,
                borderWidth: 1,
                borderColor: '#1E3A5F',
                opacity: mod.route ? 1 : 0.65,
              }}
            >
              {/* Icon box */}
              <View
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 14,
                  backgroundColor: '#0B1524',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 16,
                  borderWidth: 1,
                  borderColor: '#1E3A5F',
                }}
              >
                {mod.icon}
              </View>

              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                  <Text style={{ color: '#E2E8F0', fontFamily: 'Poppins_700Bold', fontSize: 16 }}>
                    {mod.title}
                  </Text>
                  {mod.badge && (
                    <View
                      style={{
                        marginLeft: 8,
                        backgroundColor: 'rgba(251,191,36,0.15)',
                        borderRadius: 6,
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        borderWidth: 1,
                        borderColor: 'rgba(251,191,36,0.3)',
                      }}
                    >
                      <Text style={{ color: '#FBBF24', fontSize: 9, fontFamily: 'Poppins_700Bold', letterSpacing: 1 }}>
                        {mod.badge}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={{ color: '#475569', fontFamily: 'Poppins_400Regular', fontSize: 13 }}>
                  {mod.desc}
                </Text>
              </View>

              {mod.route && <ChevronRight size={20} color="#1E3A5F" />}
            </TouchableOpacity>
          </Animated.View>
        ))}

        {/* ── Footer ── */}
        <Animated.View entering={FadeInUp.duration(600).delay(450).springify()}>
          <View
            style={{
              marginTop: 12,
              padding: 16,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: '#1E3A5F',
              backgroundColor: 'rgba(251,191,36,0.04)',
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <Shield size={16} color="#FBBF24" style={{ marginRight: 10 }} />
            <Text style={{ color: '#475569', fontFamily: 'Poppins_400Regular', fontSize: 12, flex: 1 }}>
              Changes here affect all tenants globally. Proceed with caution.
            </Text>
          </View>
        </Animated.View>
      </View>
    </ScrollView>
  );
}
