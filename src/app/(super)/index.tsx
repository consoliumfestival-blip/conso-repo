import { coreColor, coreAlpha } from '@/constants/coreTheme';
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
      icon: <Layers size={22} color={coreColor("#FBBF24", 'warning')} />,
      color: coreColor('#1E3A5F', 'info'),
    },
    {
      label: 'Users',
      value: loadingStats ? '—' : stats.tenants,
      icon: <Users size={22} color={coreColor("#34D399", 'success')} />,
      color: coreColor('#0D2D1F', 'text'),
    },
    {
      label: 'System',
      value: 'Healthy',
      icon: <Activity size={22} color={coreColor("#818CF8", 'info')} />,
      color: coreColor('#1E1B4B', 'info'),
    },
  ];

  const modules = [
    {
      title: 'Organisation Hierarchy',
      desc: 'Manage Units, Sectors & Divisions globally',
      icon: <Layers size={26} color={coreColor("#FBBF24", 'warning')} />,
      route: '/(super)/organisations',
      badge: null,
      delay: 100,
    },
    {
      title: 'Tenant Accounts',
      desc: 'View and configure all tenant settings',
      icon: <Globe size={26} color={coreColor("#34D399", 'success')} />,
      route: '/(super)/tenants',
      badge: null,
      delay: 200,
    },
    {
      title: 'System Logs',
      desc: 'Monitor application and server activity',
      icon: <FileText size={26} color={coreColor("#818CF8", 'info')} />,
      route: null,
      badge: 'Soon',
      delay: 300,
    },
    {
      title: 'Festival Settings',
      desc: 'Manage global scoring rules and items',
      icon: <Settings size={26} color={coreColor("#38BDF8", 'info')} />,
      route: '/(admin)/settings',
      badge: null,
      delay: 400,
    },
    {
      title: 'Appearance',
      desc: 'Personalize Core and Stage Management on this device',
      icon: <Settings size={26} color={coreColor('#38BDF8', 'primaryText')} />,
      route: '/(super)/appearance',
      badge: null,
      delay: 400,
    },
    {
      title: 'Communication Center',
      desc: 'Send notifications across all tenants',
      icon: <Bell size={26} color={coreColor("#F472B6", 'info')} />,
      route: '/(admin)/communication',
      badge: null,
      delay: 500,
    },
    {
      title: 'Leaderboard Management',
      desc: 'Control visibility and calculate results',
      icon: <Trophy size={26} color={coreColor("#FBBF24", 'warning')} />,
      route: '/(admin)/settings/leaderboard',
      badge: null,
      delay: 600,
    },
  ];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: coreColor('#0B1524', 'surfaceStrong') }}
      contentContainerStyle={{ paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Header ── */}
      <LinearGradient
        colors={[coreColor('#0B1524', 'surfaceStrong'), coreColor('#111E35', 'surfaceStrong'), coreColor('#0B1524', 'surfaceStrong')]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          paddingTop: 64,
          paddingBottom: 32,
          paddingHorizontal: 24,
          borderBottomWidth: 1,
          borderBottomColor: coreColor('#1E3A5F', 'border'),
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
                  backgroundColor: coreAlpha(coreColor('#fbbf24', 'overlay'), 0.12),
                  borderWidth: 1,
                  borderColor: coreAlpha(coreColor('#fbbf24', 'border'), 0.3),
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 14,
                }}
              >
                <Shield size={26} color={coreColor("#FBBF24", 'warning')} />
              </View>
              <View>
                <Text style={{ color: coreColor('#94A3B8', 'textSubtle'), fontFamily: 'Poppins_400Regular', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 2 }}>
                  Superadmin
                </Text>
                <Text style={{ color: coreColor('#E2E8F0', 'text'), fontFamily: 'Poppins_900Black', fontSize: 26, lineHeight: 30 }}>
                  Master Panel
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={handleLogout}
              style={{
                padding: 12,
                backgroundColor: coreAlpha(coreColor('#ef4444', 'overlay'), 0.1),
                borderRadius: 14,
                borderWidth: 1,
                borderColor: coreAlpha(coreColor('#ef4444', 'border'), 0.25),
              }}
            >
              <LogOut size={20} color={coreColor("#F87171", 'danger')} />
            </TouchableOpacity>
          </View>

          {/* User pill */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginTop: 20,
              backgroundColor: coreAlpha(coreColor('#1e3a5f', 'overlay'), 0.5),
              borderRadius: 30,
              paddingHorizontal: 14,
              paddingVertical: 8,
              alignSelf: 'flex-start',
              borderWidth: 1,
              borderColor: coreColor('#1E3A5F', 'border'),
            }}
          >
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: coreColor('#34D399', 'successAction'),
                marginRight: 8,
              }}
            />
            <Text style={{ color: coreColor('#94A3B8', 'textSubtle'), fontFamily: 'Poppins_400Regular', fontSize: 12 }}>
              {user?.email ?? 'Ultimate Admin'}
            </Text>
          </View>
        </Animated.View>
      </LinearGradient>

      <View style={{ paddingHorizontal: 20 }}>
        {/* ── Stats ── */}
        <Animated.View entering={FadeInUp.duration(500).delay(50).springify()}>
          <Text style={{ color: coreColor('#475569', 'text'), fontFamily: 'Poppins_700Bold', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>
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
                  borderColor: coreColor('#1E3A5F', 'border'),
                }}
              >
                <View style={{ marginBottom: 10 }}>{stat.icon}</View>
                {loadingStats && stat.label !== 'System' ? (
                  <ActivityIndicator size="small" color={coreColor("#FBBF24", 'warning')} style={{ alignSelf: 'flex-start', marginBottom: 6 }} />
                ) : (
                  <Text style={{ color: coreColor('#E2E8F0', 'text'), fontFamily: 'Poppins_900Black', fontSize: 22, lineHeight: 26 }}>
                    {stat.value}
                  </Text>
                )}
                <Text style={{ color: coreColor('#64748B', 'textMuted'), fontFamily: 'Poppins_400Regular', fontSize: 11, marginTop: 2 }}>
                  {stat.label}
                </Text>
              </View>
            ))}
          </View>
        </Animated.View>

        {/* ── Modules ── */}
        <Text style={{ color: coreColor('#475569', 'text'), fontFamily: 'Poppins_700Bold', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>
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
                backgroundColor: coreColor('#111E35', 'surfaceStrong'),
                borderRadius: 10,
                padding: 18,
                marginBottom: 12,
                borderWidth: 1,
                borderColor: coreColor('#1E3A5F', 'border'),
                opacity: mod.route ? 1 : 0.65,
              }}
            >
              {/* Icon box */}
              <View
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 14,
                  backgroundColor: coreColor('#0B1524', 'surfaceStrong'),
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 16,
                  borderWidth: 1,
                  borderColor: coreColor('#1E3A5F', 'border'),
                }}
              >
                {mod.icon}
              </View>

              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                  <Text style={{ color: coreColor('#E2E8F0', 'text'), fontFamily: 'Poppins_700Bold', fontSize: 16 }}>
                    {mod.title}
                  </Text>
                  {mod.badge && (
                    <View
                      style={{
                        marginLeft: 8,
                        backgroundColor: coreAlpha(coreColor('#fbbf24', 'overlay'), 0.15),
                        borderRadius: 6,
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        borderWidth: 1,
                        borderColor: coreAlpha(coreColor('#fbbf24', 'border'), 0.3),
                      }}
                    >
                      <Text style={{ color: coreColor('#FBBF24', 'warning'), fontSize: 9, fontFamily: 'Poppins_700Bold', letterSpacing: 1 }}>
                        {mod.badge}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={{ color: coreColor('#475569', 'text'), fontFamily: 'Poppins_400Regular', fontSize: 13 }}>
                  {mod.desc}
                </Text>
              </View>

              {mod.route && <ChevronRight size={20} color={coreColor("#1E3A5F", 'info')} />}
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
              borderColor: coreColor('#1E3A5F', 'border'),
              backgroundColor: coreAlpha(coreColor('#fbbf24', 'overlay'), 0.04),
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <Shield size={16} color={coreColor("#FBBF24", 'warning')} style={{ marginRight: 10 }} />
            <Text style={{ color: coreColor('#475569', 'text'), fontFamily: 'Poppins_400Regular', fontSize: 12, flex: 1 }}>
              Changes here affect all tenants globally. Proceed with caution.
            </Text>
          </View>
        </Animated.View>
      </View>
    </ScrollView>
  );
}
