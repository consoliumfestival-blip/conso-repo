import { ui } from '@/constants/designSystem';
import React, { useEffect, useState } from 'react';
import {
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SsfDashboardSkeleton } from '../../components/ui/SsfSkeleton';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import {
  BarChart3,
  Bell,
  Building2,
  Calendar,
  ChevronDown,
  ChevronRight,
  Clock,
  Home,
  ListFilter,
  Medal,
  Megaphone,
  Menu,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Trophy,
  UserCheck,
  UserCircle,
  Users,
} from 'lucide-react-native';

import { useAdminDashboard } from '../../core/hooks/useAdminDashboard';
import { usePageAccess } from '../../core/hooks/usePageAccess';
import { useAuthStore } from '../../core/store/authStore';
import { usePageManagementStore } from '../../core/store/pageManagementStore';
import { PageAccessControl } from '../../components/layout/PageAccessControl';
import { useNotificationsInbox } from '../../core/hooks/useNotificationsInbox';

type DashboardIcon = React.ComponentType<{
  color?: string;
  size?: number;
  strokeWidth?: number;
}>;

type NavigationItem = {
  label: string;
  icon: DashboardIcon;
  visible: boolean;
  active?: boolean;
  onPress?: () => void;
};

type MetricCardProps = {
  label: string;
  value: string;
  delta: string;
  trend: 'up' | 'down' | 'neutral';
  icon: DashboardIcon;
  iconBg: string;
  iconColor: string;
  delay: number;
};

type ActionCardProps = {
  label: string;
  icon: DashboardIcon;
  visible: boolean;
  onPress?: () => void;
};

type InsightView = 'overview' | 'categories' | 'organisations';

const NAVY = ui.colors.text; // Text Primary
const MUTED = ui.colors.textMuted; // Text Secondary
const PAGE_BG = '#E2E8F0'; // Page Background
const BORDER = '#E2E8F0'; // Border
const EMERALD = '#0F766E'; // Primary Green
const EMERALD_DARK = '#0B5D4B'; // Dark Green
const SIDEBAR = '#0F766E'; // Sidebar Primary Green
const SIDEBAR_DARK = '#0B5D4B'; // Sidebar Dark Green

const SUCCESS = '#10B981'; // Success
const WARNING = '#F59E0B'; // Warning
const DANGER = '#EF4444'; // Danger
const INFO = '#3B82F6'; // Info

const categoryColors = ['#14B8A6', '#10B981', '#F97316', '#38BDF8', '#8B5CF6', '#6366F1', '#2563EB', '#F43F5E'];

const dashboardBgStyle = {
  backgroundColor: '#F4F8F7',
  ...Platform.select({
    web: {
      backgroundImage: 'linear-gradient(135deg, #F4F8F7 0%, #F2F6FA 55%, #F7F9FB 100%)',
    },
    default: {},
  }),
} as any;

// Layer 1 Surface (Welcome Section - Soft Glass)
const welcomeSurface = {
  borderWidth: 1,
  borderColor: 'rgba(100, 116, 139, 0.25)',
  borderRadius: 10,
  shadowColor: ui.colors.text,
  shadowOpacity: 0.015,
  shadowRadius: 3,
  shadowOffset: { width: 0, height: 1 },
  ...Platform.select({
    web: {
      backgroundColor: 'rgba(255, 255, 255, 0.90)',
      backdropFilter: 'blur(6px)',
      WebkitBackdropFilter: 'blur(6px)',
      boxShadow: '0 1px 3px rgba(15, 23, 42, 0.015)',
    },
    default: {
      backgroundColor: ui.colors.surface,
    },
  }),
  elevation: 1,
} as any;

// Layer 2 Surface (Metric Cards - Soft Glass)
const cardSurface = {
  borderWidth: 1,
  borderColor: 'rgba(100, 116, 139, 0.25)',
  borderRadius: 10,
  shadowColor: ui.colors.text,
  shadowOpacity: 0.015,
  shadowRadius: 3,
  shadowOffset: { width: 0, height: 1 },
  ...Platform.select({
    web: {
      backgroundColor: 'rgba(255, 255, 255, 0.90)',
      backdropFilter: 'blur(6px)',
      WebkitBackdropFilter: 'blur(6px)',
      boxShadow: '0 1px 3px rgba(15, 23, 42, 0.015)',
    },
    default: {
      backgroundColor: ui.colors.surface,
    },
  }),
  elevation: 1,
} as any;

// Layer 2.5 Surface (Quick Action Cards - Soft Glass)
const actionCardSurface = {
  borderWidth: 1,
  borderColor: 'rgba(100, 116, 139, 0.25)',
  borderRadius: 10,
  shadowColor: ui.colors.text,
  shadowOpacity: 0.015,
  shadowRadius: 3,
  shadowOffset: { width: 0, height: 1 },
  ...Platform.select({
    web: {
      backgroundColor: 'rgba(255, 255, 255, 0.90)',
      backdropFilter: 'blur(6px)',
      WebkitBackdropFilter: 'blur(6px)',
      boxShadow: '0 1px 3px rgba(15, 23, 42, 0.015)',
    },
    default: {
      backgroundColor: ui.colors.surface,
    },
  }),
  elevation: 1,
} as any;

// Layer 3 Surface (Analytics & Activity Panels - High-Readability Data Panels)
const panelSurface = {
  borderWidth: 1,
  borderColor: 'rgba(100, 116, 139, 0.25)',
  borderRadius: 10,
  shadowColor: ui.colors.text,
  shadowOpacity: 0.015,
  shadowRadius: 3,
  shadowOffset: { width: 0, height: 1 },
  ...Platform.select({
    web: {
      backgroundColor: 'rgba(255, 255, 255, 0.97)',
      boxShadow: '0 1px 3px rgba(15, 23, 42, 0.015)',
    },
    default: {
      backgroundColor: ui.colors.surface,
    },
  }),
  elevation: 1,
} as any;



function formatTime(value: number | string | Date = Date.now()) {
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRelativeTime(value: string) {
  const timestamp = new Date(value).getTime();
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (elapsedMinutes < 1) return 'Just now';
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}h ago`;
  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 7) return `${elapsedDays}d ago`;
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function MetricCard({ label, value, delta, trend, icon: Icon, iconBg, iconColor, delay }: MetricCardProps) {
  const trendColor = trend === 'down' ? DANGER : trend === 'neutral' ? MUTED : SUCCESS;
  const trendPrefix = trend === 'down' ? '-' : trend === 'neutral' ? '' : '+';

  return (
    <Animated.View
      entering={FadeInUp.duration(420).delay(delay).springify()}
      className="metric-card"
      style={[cardSurface, { flex: 1, minWidth: 190, height: 102, padding: 15, overflow: 'hidden' }]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontFamily: 'Poppins_400Regular', color: MUTED, fontSize: 11.5 }}>{label}</Text>
        <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: iconBg, alignItems: 'center', justifyContent: 'center' }}>
          <Icon color={iconColor} size={19} strokeWidth={2.4} />
        </View>
      </View>
      <View style={{ marginTop: -4 }}>
        <Text style={{ fontFamily: 'Poppins_700Bold', color: NAVY, fontSize: 25, lineHeight: 29, letterSpacing: -0.6 }}>{value}</Text>
        <Text numberOfLines={1} style={{ fontFamily: 'Poppins_700Bold', color: trendColor, fontSize: 10.5, marginTop: 1 }}>
          {trendPrefix} {delta}
        </Text>
      </View>
    </Animated.View>
  );
}

function SidebarItem({ label, icon: Icon, active, onPress }: NavigationItem) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.82}
      style={{
        height: 38,
        borderRadius: 9,
        paddingHorizontal: 12,
        marginBottom: 6,
        backgroundColor: active ? 'rgba(255, 255, 255, 0.14)' : 'transparent',
        borderWidth: active ? 1 : 0,
        borderColor: active ? 'rgba(255, 255, 255, 0.20)' : 'transparent',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
        <Icon color={active ? ui.colors.surface : 'rgba(255, 255, 255, 0.65)'} size={16} strokeWidth={2.1} />
        <Text numberOfLines={1} style={{ fontFamily: 'Poppins_700Bold', color: active ? ui.colors.surface : 'rgba(255, 255, 255, 0.72)', fontSize: 12.5, marginLeft: 10, flex: 1, letterSpacing: 0.3 }}>
          {label}
        </Text>
      </View>
      {!active && <ChevronRight color="rgba(255, 255, 255, 0.4)" size={13} />}
    </TouchableOpacity>
  );
}


function ActionCard({ label, icon: Icon, visible, onPress }: ActionCardProps) {
  if (!visible) return null;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.8}
      className="action-card"
      style={[actionCardSurface, { height: 62, flex: 1, minWidth: 175, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center' }]}
    >
      <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: ui.colors.successSoft, alignItems: 'center', justifyContent: 'center', marginRight: 11 }}>
        <Icon color={EMERALD_DARK} size={19} strokeWidth={2.4} />
      </View>
      <Text numberOfLines={2} style={{ flex: 1, fontFamily: 'Poppins_700Bold', color: NAVY, fontSize: 11.5, lineHeight: 15 }}>
        {label}
      </Text>
      <ChevronRight color={ui.colors.textSubtle} size={15} />
    </TouchableOpacity>
  );
}

function InsightChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.82}
      style={{
        minHeight: 32,
        paddingHorizontal: 14,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: active ? EMERALD : BORDER,
        backgroundColor: active ? '#E6F6F2' : ui.colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontFamily: 'Poppins_700Bold', color: active ? EMERALD_DARK : MUTED, fontSize: 10.5 }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
      <Text style={{ fontFamily: 'Poppins_700Bold', color: NAVY, fontSize: 14 }}>{title}</Text>
      {action && (
        <TouchableOpacity
          onPress={onAction}
          disabled={!onAction}
          style={{ height: 28, paddingHorizontal: 14, borderRadius: 999, backgroundColor: ui.colors.successSoft, flexDirection: 'row', alignItems: 'center' }}
        >
          <Text style={{ fontFamily: 'Poppins_700Bold', color: EMERALD_DARK, fontSize: 10 }}>{action}</Text>
          <ChevronRight color={EMERALD_DARK} size={13} />
        </TouchableOpacity>
      )}
    </View>
  );
}

function EmptyAnalytics({ title }: { title: string }) {
  return (
    <View style={[panelSurface, { flex: 1, minWidth: 310, minHeight: 222, padding: 16 }]}>
      <SectionHeader title={title} />
      <View style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: BORDER, backgroundColor: '#EDF2F7', alignItems: 'center', justifyContent: 'center' }}>
        <BarChart3 color="#CBD5E1" size={34} />
        <Text style={{ fontFamily: 'Poppins_700Bold', color: MUTED, fontSize: 12, marginTop: 8 }}>No dashboard data yet</Text>
      </View>
    </View>
  );
}

export default function AdminDashboard() {
  const { logout, user, role, is_superadmin } = useAuthStore();
  const router = useRouter();
  const { useStats } = useAdminDashboard();
  const { data, isLoading, isRefetching, isError, dataUpdatedAt, refetch } = useStats();
  const { notifications } = useNotificationsInbox();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const isTablet = width >= 768;
  const showEmbeddedNavigation = false;
  const [searchQuery, setSearchQuery] = useState('');
  const [showSidebar, setShowSidebar] = useState(true);
  const [insightView, setInsightView] = useState<InsightView>('overview');

  const syncRegistry = usePageManagementStore((state) => state.syncRegistry);
  const fetchPages = usePageManagementStore((state) => state.fetchPages);

  useEffect(() => {
    const initPageRegistry = async () => {
      await syncRegistry();
      await fetchPages();
    };
    initPageRegistry();
  }, [syncRegistry, fetchPages]);

  const { isVisible: pVisible } = usePageAccess('admin_participants');
  const { isVisible: sVisible } = usePageAccess('admin_schedule');
  const { isVisible: oVisible } = usePageAccess('admin_organisations');
  const { isVisible: setVisible } = usePageAccess('system_settings');
  const { isVisible: cVisible } = usePageAccess('admin_communication');
  const { isVisible: jVisible } = usePageAccess('admin_judges');
  const { isVisible: lVisible } = usePageAccess('admin_leaderboard');

  const refreshing = isRefetching;
  const orgData = data ? { name: data.orgName, type: data.orgType } : null;
  const stats = data
    ? { participants: data.participantsCount, items: data.itemsCount, pendingRegs: data.pendingRegsCount }
    : { participants: 0, items: 0, pendingRegs: 0 };

  const orgName = orgData?.name ?? 'Organisation';
  const orgType = orgData?.type ?? 'Admin';
  const updatedAt = dataUpdatedAt ? formatTime(dataUpdatedAt) : 'Not synced';
  const categoryTotal = data?.categoryGraph?.reduce((sum, item) => sum + item.count, 0) ?? 0;
  const unitTotal = data?.unitGraph?.reduce((sum, item) => sum + item.count, 0) ?? 0;
  const unreadNotificationCount = notifications.filter(
    (notification) => notification.status === 'sent' || notification.status === 'pending'
  ).length;
  const userName =
    user?.user_metadata?.full_name ||
    user?.email?.split('@')[0] ||
    'Admin';
  const roleLabel = is_superadmin
    ? 'Super Admin'
    : role
      ? role.charAt(0).toUpperCase() + role.slice(1)
      : 'Admin';

  const onRefresh = () => {
    refetch();
  };

  const navigationItems: NavigationItem[] = [
    { label: 'Dashboard', icon: Home, visible: true, active: true, onPress: () => router.push('/(admin)' as any) },
    { label: 'Participants', icon: Users, visible: pVisible, onPress: () => router.push('/(admin)/participants' as any) },
    { label: 'Schedules', icon: Calendar, visible: sVisible, onPress: () => router.push('/(admin)/schedule' as any) },
    { label: 'Sub Organisations', icon: Building2, visible: oVisible, onPress: () => router.push('/(admin)/organisations' as any) },
    { label: 'Festival Settings', icon: Settings, visible: setVisible, onPress: () => router.push('/(admin)/settings' as any) },
    { label: 'Communication Center', icon: Megaphone, visible: cVisible, onPress: () => router.push('/(admin)/communication' as any) },
    { label: 'Judge Management', icon: UserCheck, visible: jVisible, onPress: () => router.push('/(admin)/judges' as any) },
    { label: 'Leaderboard Management', icon: Medal, visible: lVisible, onPress: () => router.push('/(admin)/settings/leaderboard' as any) },
    { label: 'Open Judge Portal', icon: Trophy, visible: true, onPress: () => router.push('/judge' as any) },
  ];

  const actionItems: ActionCardProps[] = [
    { label: 'Manage Participants', icon: Users, visible: pVisible, onPress: () => router.push('/(admin)/participants' as any) },
    { label: 'Manage Schedules', icon: Calendar, visible: sVisible, onPress: () => router.push('/(admin)/schedule' as any) },
    { label: 'Sub Organisations', icon: Building2, visible: oVisible, onPress: () => router.push('/(admin)/organisations' as any) },
    { label: 'Festival Settings', icon: Settings, visible: setVisible, onPress: () => router.push('/(admin)/settings' as any) },
    { label: 'Communication Center', icon: Megaphone, visible: cVisible, onPress: () => router.push('/(admin)/communication' as any) },
    { label: 'Judge Management', icon: UserCheck, visible: jVisible, onPress: () => router.push('/(admin)/judges' as any) },
    { label: 'Leaderboard Management', icon: BarChart3, visible: lVisible, onPress: () => router.push('/(admin)/settings/leaderboard' as any) },
  ];

  const searchableNavigationItems = navigationItems.filter(
    (item) => item.visible && item.onPress && item.label !== 'Dashboard'
  );
  const searchResults = searchQuery.trim()
    ? searchableNavigationItems
        .filter((item) => item.label.toLowerCase().includes(searchQuery.trim().toLowerCase()))
        .slice(0, 6)
    : [];

  const activityItems = (data?.recentRegistrations ?? []).map((registration) => ({
    id: registration.id,
    title: registration.participantName,
    detail: `${registration.itemName} • ${registration.organisationName}`,
    time: formatRelativeTime(registration.createdAt),
    icon: Users,
    bg: ui.colors.successSoft,
    color: EMERALD_DARK,
  }));

  if (isLoading && !refreshing) {
    return <SsfDashboardSkeleton />;
  }

  return (
    <PageAccessControl pageKey="admin_dashboard">
      <View style={{ flex: 1, backgroundColor: PAGE_BG, flexDirection: 'row' }}>
        {showEmbeddedNavigation && isTablet && showSidebar && (
          <View style={{ width: 210, backgroundColor: SIDEBAR }}>
            <View style={{ height: 84, paddingHorizontal: 16, justifyContent: 'center', backgroundColor: SIDEBAR_DARK }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: ui.colors.surface, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                  <ShieldCheck color={EMERALD_DARK} size={25} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: 'Poppins_700Bold', color: '#D1FAE5', fontSize: 8, letterSpacing: 1.4, textTransform: 'uppercase' }}>
                    {orgType} Portal
                  </Text>
                  <Text numberOfLines={1} style={{ fontFamily: 'Poppins_700Bold', color: ui.colors.surface, fontSize: 18, lineHeight: 21, letterSpacing: 0.4 }}>
                    {orgName}
                  </Text>
                  <Text style={{ fontFamily: 'Poppins_400Regular', color: '#D1FAE5', fontSize: 10 }}>Manage your festival operations</Text>
                </View>
              </View>
            </View>

            <ScrollView style={{ flex: 1, paddingHorizontal: 12, paddingTop: 16 }} showsVerticalScrollIndicator={false}>
              {navigationItems.filter((item) => item.visible).map((item) => (
                <SidebarItem key={item.label} {...item} />
              ))}
            </ScrollView>

            <View style={{ padding: 14, paddingBottom: 18 }}>
              <View style={{ borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 12, marginBottom: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: EMERALD, alignItems: 'center', justifyContent: 'center' }}>
                    <ShieldCheck color={ui.colors.surface} size={16} />
                  </View>
                  <View style={{ marginLeft: 10, flex: 1 }}>
                    <Text numberOfLines={1} style={{ fontFamily: 'Poppins_700Bold', color: ui.colors.surface, fontSize: 10 }}>{orgName}</Text>
                    <Text style={{ fontFamily: 'Poppins_400Regular', color: '#CFFAFE', fontSize: 9 }}>Festival Management System</Text>
                  </View>
                </View>
              </View>
              <View style={{ height: 116, borderRadius: 18, backgroundColor: SIDEBAR_DARK, overflow: 'hidden', alignItems: 'center', justifyContent: 'flex-end' }}>
                <Building2 color={ui.colors.surface} size={84} strokeWidth={1.2} />
                <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(15,118,110,0.18)' }} />
              </View>
            </View>
          </View>
        )}

        <View style={[{ flex: 1 }, dashboardBgStyle]}>
          <View
            style={[
              { display: isTablet ? 'none' : 'flex', height: 56, backgroundColor: ui.colors.surface, borderBottomWidth: 1, borderBottomColor: 'rgba(226, 232, 240, 0.8)', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', zIndex: 10 },
              Platform.OS === 'web' ? { position: 'sticky' as any, top: 0 } : undefined,
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              {isTablet && (
                <TouchableOpacity
                  onPress={() => setShowSidebar((current) => !current)}
                  accessibilityRole="button"
                  accessibilityLabel={showSidebar ? 'Hide navigation' : 'Show navigation'}
                  style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}
                >
                  <Menu color={NAVY} size={22} />
                </TouchableOpacity>
              )}
              <View style={{ width: isDesktop ? 280 : 210, position: 'relative', zIndex: 20 }}>
                <View style={{ height: 38, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(226, 232, 240, 0.8)', backgroundColor: ui.colors.surface, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13 }}>
                  <Search color={ui.colors.textMuted} size={16} />
                  <TextInput
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="Search pages..."
                    placeholderTextColor={ui.colors.textSubtle}
                    style={{ flex: 1, marginLeft: 10, fontFamily: 'Poppins_400Regular', color: NAVY, fontSize: 12, paddingVertical: 0 }}
                  />
                </View>
                {searchResults.length > 0 && (
                  <View
                    style={{
                      position: 'absolute',
                      top: 43,
                      left: 0,
                      right: 0,
                      borderWidth: 1,
                      borderColor: BORDER,
                      borderRadius: 10,
                      backgroundColor: ui.colors.surface,
                      padding: 6,
                      shadowColor: ui.colors.text,
                      shadowOpacity: 0.12,
                      shadowRadius: 10,
                      elevation: 8,
                    }}
                  >
                    {searchResults.map((item) => {
                      const Icon = item.icon;
                      return (
                        <TouchableOpacity
                          key={item.label}
                          onPress={() => {
                            setSearchQuery('');
                            item.onPress?.();
                          }}
                          style={{ paddingHorizontal: 10, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', borderRadius: 8 }}
                        >
                          <Icon color={EMERALD_DARK} size={15} />
                          <Text style={{ marginLeft: 9, fontFamily: 'Poppins_700Bold', color: NAVY, fontSize: 11 }}>
                            {item.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <TouchableOpacity
                onPress={() => router.push('/notifications' as any)}
                accessibilityRole="button"
                accessibilityLabel={`${unreadNotificationCount} unread notifications`}
                style={{ position: 'relative', padding: 4 }}
              >
                <Bell color={NAVY} size={19} />
                {unreadNotificationCount > 0 && (
                  <View style={{ position: 'absolute', top: -5, right: -5, minWidth: 16, height: 16, paddingHorizontal: 3, borderRadius: 8, backgroundColor: EMERALD, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontFamily: 'Poppins_700Bold', color: ui.colors.surface, fontSize: 8 }}>
                      {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity onPress={logout} activeOpacity={0.82} style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#FFF7ED', alignItems: 'center', justifyContent: 'center' }}>
                  <UserCircle color="#9A3412" size={29} />
                </View>
                {isTablet && (
                  <View style={{ marginLeft: 10 }}>
                    <Text numberOfLines={1} style={{ maxWidth: 140, fontFamily: 'Poppins_700Bold', color: NAVY, fontSize: 12 }}>{userName}</Text>
                    <Text style={{ fontFamily: 'Poppins_400Regular', color: MUTED, fontSize: 10 }}>{roleLabel}</Text>
                  </View>
                )}
                {isTablet && <ChevronDown color={MUTED} size={15} style={{ marginLeft: 6 }} />}
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView
            style={[{ flex: 1 }, dashboardBgStyle]}
            contentContainerStyle={{
              padding: isDesktop ? 24 : 16,
              paddingBottom: 16,
              maxWidth: 1650,
              width: '100%',
              alignSelf: 'center',
            }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={EMERALD_DARK} />}
          >
            {!isTablet && (
              <View style={{ backgroundColor: SIDEBAR, borderRadius: 14, padding: 14, marginBottom: 12 }}>
                <Text style={{ fontFamily: 'Poppins_700Bold', color: '#D1FAE5', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.2 }}>{orgType} Portal</Text>
                <Text style={{ fontFamily: 'Montserrat_700Bold', color: ui.colors.surface, fontSize: 21 }}>{orgName}</Text>
              </View>
            )}

            <Animated.View
              entering={FadeInDown.duration(380).springify()}
              className="welcome-card"
              style={[
                welcomeSurface,
                {
                  minHeight: 88,
                  padding: isDesktop ? 17 : 16,
                  marginBottom: 16,
                  overflow: 'hidden',
                }
              ]}
            >
              <LinearGradient
                colors={[ui.colors.surface, '#F8FBFA']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[StyleSheet.absoluteFillObject, { zIndex: -1 }]}
              />
              <View style={{ flexDirection: isDesktop ? 'row' : 'column', alignItems: isDesktop ? 'center' : 'flex-start', justifyContent: 'space-between', width: '100%' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 260 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: '#D1FAE5', alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
                    <Users color={EMERALD_DARK} size={23} strokeWidth={2.4} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: 'Poppins_700Bold', color: NAVY, fontSize: isDesktop ? 19 : 18, lineHeight: 24 }}>Welcome back, {userName}!</Text>
                    <Text style={{ fontFamily: 'Poppins_400Regular', color: MUTED, fontSize: 11.5, marginTop: 3 }}>Here is what is happening with your festival today.</Text>
                  </View>
                </View>

                <View style={{ alignItems: isDesktop ? 'flex-end' : 'flex-start', marginTop: isDesktop ? 0 : 14 }}>
                  <TouchableOpacity onPress={onRefresh} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                    <Text style={{ fontFamily: 'Poppins_400Regular', color: MUTED, fontSize: 10 }}>Last updated: {updatedAt}</Text>
                    <RefreshCw color={MUTED} size={13} style={{ marginLeft: 8 }} />
                  </TouchableOpacity>
                  <View style={{ width: 194, height: 38, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(226, 232, 240, 0.6)', backgroundColor: ui.colors.surface, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: isError ? DANGER : SUCCESS, marginRight: 10 }} />
                    <View>
                      <Text style={{ fontFamily: 'Poppins_400Regular', color: MUTED, fontSize: 10 }}>Dashboard Data</Text>
                      <Text style={{ fontFamily: 'Poppins_700Bold', color: isError ? DANGER : EMERALD, fontSize: 11 }}>
                        {isError ? 'Unable to sync' : 'Synced with Supabase'}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            </Animated.View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
              <MetricCard label="Participants" value={stats.participants.toLocaleString()} delta={`${data?.participantsLast7Days ?? 0} added in last 7 days`} trend="neutral" icon={Users} iconBg={ui.colors.primarySoft} iconColor={EMERALD} delay={80} />
              <MetricCard label="Items" value={stats.items.toLocaleString()} delta="Active festival items" trend="neutral" icon={Trophy} iconBg={ui.colors.warningSoft} iconColor={WARNING} delay={140} />
              <MetricCard label="Pending Registrations" value={stats.pendingRegs.toLocaleString()} delta={`${data?.pendingRegsLast7Days ?? 0} created in last 7 days`} trend="neutral" icon={Clock} iconBg={ui.colors.destructiveSoft} iconColor={DANGER} delay={200} />
              <MetricCard label="Active Schedules" value={(data?.activeSchedulesCount ?? 0).toLocaleString()} delta="Scheduled or ongoing events" trend="neutral" icon={Calendar} iconBg={ui.colors.infoSoft} iconColor={INFO} delay={260} />
            </View>


            <Animated.View entering={FadeInUp.duration(420).delay(280).springify()} style={{ marginBottom: 18 }}>
              <View style={{ paddingBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontFamily: 'Poppins_700Bold', color: NAVY, fontSize: 14 }}>Quick Actions</Text>
                <Text style={{ fontFamily: 'Poppins_400Regular', color: MUTED, fontSize: 10.5 }}>Festival shortcuts</Text>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, width: '100%' }}>
                {actionItems.map((item) => (
                  <ActionCard key={item.label} {...item} />
                ))}
              </View>
            </Animated.View>

            <View
              style={[
                panelSurface,
                {
                  minHeight: 58,
                  paddingHorizontal: 14,
                  paddingVertical: 11,
                  marginBottom: 12,
                  flexDirection: isTablet ? 'row' : 'column',
                  alignItems: isTablet ? 'center' : 'flex-start',
                  justifyContent: 'space-between',
                  gap: 10,
                },
              ]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: '#E6F6F2', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                  <ListFilter color={EMERALD_DARK} size={18} />
                </View>
                <View>
                  <Text style={{ fontFamily: 'Poppins_700Bold', color: NAVY, fontSize: 13 }}>Festival insights</Text>
                  <Text style={{ fontFamily: 'Poppins_400Regular', color: MUTED, fontSize: 10 }}>Choose the analytics you want to focus on</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <InsightChip label="Overview" active={insightView === 'overview'} onPress={() => setInsightView('overview')} />
                <InsightChip label="Categories" active={insightView === 'categories'} onPress={() => setInsightView('categories')} />
                <InsightChip label="Sub Organisations" active={insightView === 'organisations'} onPress={() => setInsightView('organisations')} />
              </View>
            </View>

            <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 16 }}>
              {insightView !== 'organisations' && (data?.categoryGraph && data.categoryGraph.length > 0 ? (
                <Animated.View entering={FadeInUp.duration(460).delay(360).springify()} className="panel-card" style={[panelSurface, { flex: insightView === 'categories' ? 1.45 : 1, minWidth: 330, minHeight: 222, padding: 16 }]}>
                  <SectionHeader title="Participants by Category" action="View Details" onAction={() => router.push('/(admin)/participants' as any)} />
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <View style={{ width: 148, height: 148, alignItems: 'center', justifyContent: 'center', marginRight: 18 }}>
                      <Svg width={148} height={148} viewBox="0 0 148 148">
                        <Circle cx="74" cy="74" r="58" stroke="#F1F5F9" strokeWidth="12" fill="none" />
                        {(() => {
                          const radius = 58;
                          const circumference = 2 * Math.PI * radius;
                          let offset = 0;
                          return data.categoryGraph.map((item, index) => {
                            const segment = categoryTotal > 0 ? item.count / categoryTotal : 0;
                            const dash = `${segment * circumference} ${circumference}`;
                            const circle = (
                              <Circle
                                key={item.name}
                                cx="74"
                                cy="74"
                                r={radius}
                                stroke={categoryColors[index % categoryColors.length]}
                                strokeWidth="12"
                                fill="none"
                                strokeDasharray={dash}
                                strokeDashoffset={-offset}
                                strokeLinecap="butt"
                                rotation="-90"
                                origin="74, 74"
                              />
                            );
                            offset += segment * circumference;
                            return circle;
                          });
                        })()}
                      </Svg>
                      <View style={{ position: 'absolute', alignItems: 'center' }}>
                        <Text style={{ fontFamily: 'Montserrat_700Bold', color: NAVY, fontSize: 22 }}>{categoryTotal.toLocaleString()}</Text>
                        <Text style={{ fontFamily: 'Poppins_400Regular', color: MUTED, fontSize: 11 }}>Total</Text>
                      </View>
                    </View>

                    <View style={{ flex: 1, gap: 9 }}>
                      {data.categoryGraph.slice(0, 7).map((item, index) => {
                        const pct = categoryTotal > 0 ? ((item.count / categoryTotal) * 100).toFixed(1) : '0.0';
                        return (
                          <View key={item.name} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                              <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: categoryColors[index % categoryColors.length], marginRight: 10 }} />
                              <Text style={{ fontFamily: 'Poppins_700Bold', color: MUTED, fontSize: 10 }}>{item.name}</Text>
                            </View>
                            <Text style={{ fontFamily: 'Poppins_700Bold', color: NAVY, fontSize: 10 }}>
                              {item.count} ({pct}%)
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                </Animated.View>
              ) : (
                <EmptyAnalytics title="Participants by Category" />
              ))}

              {insightView !== 'categories' && (data?.unitGraph && data.unitGraph.length > 0 ? (
                <Animated.View entering={FadeInUp.duration(460).delay(430).springify()} className="panel-card" style={[panelSurface, { flex: insightView === 'organisations' ? 1.45 : 1, minWidth: 340, minHeight: 222, padding: 16 }]}>
                  <SectionHeader title="Participants by Sub Organisation" action="View Details" onAction={() => router.push('/(admin)/organisations' as any)} />
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <View style={{ width: 148, height: 148, alignItems: 'center', justifyContent: 'center', marginRight: 18 }}>
                      <Svg width={148} height={148} viewBox="0 0 148 148">
                        <Circle cx="74" cy="74" r="58" stroke="#F1F5F9" strokeWidth="12" fill="none" />
                        {(() => {
                          const radius = 58;
                          const circumference = 2 * Math.PI * radius;
                          let offset = 0;
                          return data.unitGraph.slice(0, 7).map((item, index) => {
                            const segment = unitTotal > 0 ? item.count / unitTotal : 0;
                            const dash = `${segment * circumference} ${circumference}`;
                            const circle = (
                              <Circle
                                key={item.name}
                                cx="74"
                                cy="74"
                                r={radius}
                                stroke={categoryColors[(index + 3) % categoryColors.length]}
                                strokeWidth="12"
                                fill="none"
                                strokeDasharray={dash}
                                strokeDashoffset={-offset}
                                strokeLinecap="butt"
                                rotation="-90"
                                origin="74, 74"
                              />
                            );
                            offset += segment * circumference;
                            return circle;
                          });
                        })()}
                      </Svg>
                      <View style={{ position: 'absolute', alignItems: 'center' }}>
                        <Text style={{ fontFamily: 'Montserrat_700Bold', color: NAVY, fontSize: 22 }}>{unitTotal.toLocaleString()}</Text>
                        <Text style={{ fontFamily: 'Poppins_400Regular', color: MUTED, fontSize: 11 }}>Total</Text>
                      </View>
                    </View>

                    <View style={{ flex: 1, gap: 9 }}>
                      {data.unitGraph.slice(0, 7).map((item, index) => {
                        const pct = unitTotal > 0 ? ((item.count / unitTotal) * 100).toFixed(1) : '0.0';
                        return (
                          <View key={item.name} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                              <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: categoryColors[(index + 3) % categoryColors.length], marginRight: 10 }} />
                              <Text numberOfLines={1} style={{ fontFamily: 'Poppins_700Bold', color: MUTED, fontSize: 10, flex: 1 }}>{item.name}</Text>
                            </View>
                            <Text style={{ fontFamily: 'Poppins_700Bold', color: NAVY, fontSize: 10, marginLeft: 4 }}>
                              {item.count} ({pct}%)
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                </Animated.View>
              ) : (
                <EmptyAnalytics title="Participants by Sub Organisation" />
              ))}

              <Animated.View entering={FadeInUp.duration(460).delay(500).springify()} className="panel-card" style={[panelSurface, { flex: 1, minWidth: 292, minHeight: 222, padding: 16 }]}>
                <SectionHeader title="Recent Registrations" action="View All" onAction={() => router.push('/(admin)/participants' as any)} />
                <View style={{ gap: 12 }}>
                  {activityItems.length === 0 ? (
                    <View style={{ minHeight: 140, alignItems: 'center', justifyContent: 'center' }}>
                      <Users color="#CBD5E1" size={30} />
                      <Text style={{ fontFamily: 'Poppins_700Bold', color: MUTED, fontSize: 11, marginTop: 8 }}>
                        No recent registrations
                      </Text>
                    </View>
                  ) : (
                    activityItems.map((item) => {
                      const Icon = item.icon;
                      return (
                        <View key={item.id} style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                          <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: item.bg, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                            <Icon color={item.color} size={15} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                              <Text style={{ flex: 1, fontFamily: 'Poppins_700Bold', color: NAVY, fontSize: 11 }}>{item.title}</Text>
                              <Text style={{ fontFamily: 'Poppins_400Regular', color: MUTED, fontSize: 9, marginLeft: 8 }}>{item.time}</Text>
                            </View>
                            <Text style={{ fontFamily: 'Poppins_400Regular', color: MUTED, fontSize: 10, marginTop: 1 }}>{item.detail}</Text>
                          </View>
                        </View>
                      );
                    })
                  )}
                </View>
              </Animated.View>
            </View>

            <Text style={{ textAlign: 'center', fontFamily: 'Poppins_400Regular', color: ui.colors.textMuted, fontSize: 12.5, marginTop: 24, marginBottom: 24 }}>
              © {new Date().getFullYear()} {orgName} Festival Management System. All rights reserved.
            </Text>
          </ScrollView>
        </View>
      </View>
    </PageAccessControl>
  );
}
