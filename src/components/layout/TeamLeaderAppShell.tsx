import { TEAM_DESKTOP_MIN_WIDTH } from '@/constants/teamLeaderTheme';
import { useTeamTheme, useTeamUi } from '@/core/contexts/TeamLeaderThemeContext';
import { TeamText as Text } from '@/components/team/TeamText';
import React, { useState } from "react";
import { Modal, Platform, Pressable, ScrollView, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { usePathname, useRouter } from "expo-router";
import {
  CalendarDays,
  ClipboardList,
  Home,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  Sun,
  Trophy,
  Users,
  UserCircle,
  X,
} from "lucide-react-native";
import { useAuthStore } from "@/core/store/authStore";
import { useTeamLeaderContext } from "@/core/contexts/TeamLeaderContext";

type IconType = React.ComponentType<{
  color?: string;
  size?: number;
  strokeWidth?: number;
}>;

type NavItem = {
  label: string;
  shortLabel?: string;
  path: string;
  icon: IconType;
  match: (pathname: string) => boolean;
};

const navItems: NavItem[] = [
  {
    label: "Dashboard",
    shortLabel: "Home",
    path: "/team/dashboard",
    icon: Home,
    match: (path) => path === "/team/dashboard" || path === "/team",
  },
  {
    label: "My Team",
    path: "/team/my-team",
    icon: Users,
    match: (path) => path.includes("/team/my-team"),
  },
  {
    label: "Schedule",
    path: "/team/schedule",
    icon: CalendarDays,
    match: (path) => path.includes("/team/schedule"),
  },
  {
    label: "Results",
    path: "/team/results",
    icon: Trophy,
    match: (path) => path.includes("/team/results"),
  },
  {
    label: "Participants",
    path: "/team/participants",
    icon: ScrollText,
    match: (path) => path.includes("/team/participants"),
  },
  {
    label: "Programs",
    path: "/team/programs",
    icon: ClipboardList,
    match: (path) => path.includes("/team/programs"),
  },
  {
    label: "Announcements",
    path: "/team/announcements",
    icon: MessageSquare,
    match: (path) => path.includes("/team/announcements"),
  },
  {
    label: "Team Profile",
    path: "/team/profile",
    icon: UserCircle,
    match: (path) => path.includes("/team/profile"),
  },
];

export function TeamLeaderAppShell({
  children,
  hideMobileHeader = false,
  mobileEdgeToEdge = false,
}: {
  children: React.ReactNode;
  hideMobileHeader?: boolean;
  mobileEdgeToEdge?: boolean;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);
  const pathname = usePathname();
  const isFocused = useIsFocused();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { width } = useWindowDimensions();
  const { context } = useTeamLeaderContext();
  const ui = useTeamUi();
  const { mode, toggleMode } = useTeamTheme();

  React.useEffect(() => {
    const mustUpdateCredentials = user?.app_metadata?.must_change_credentials
      || user?.app_metadata?.must_change_password
      || user?.user_metadata?.must_change_credentials
      || user?.user_metadata?.must_change_password;
    if (mustUpdateCredentials && pathname !== "/team/first-login") {
      router.replace("/team/first-login");
    }
  }, [user, pathname, router]);
  const teamInitial = (context?.team_name || "T")
    .trim()
    .charAt(0)
    .toUpperCase();
  const portalRootId = Platform.OS === 'web' && isFocused
    ? 'team-leader-portal-active'
    : 'team-leader-portal';

  // Phones keep bottom navigation; medium tablets and desktops use the sidebar.
  const showSidebar = width >= TEAM_DESKTOP_MIN_WIDTH;
  const sidebarWidth = width < 900 ? 232 : 264;
  const glassSurface = Platform.OS === 'web' ? {
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
  } as any : {};
  const iconGlassSurface = Platform.OS === 'web' ? {
    backdropFilter: 'blur(3px)',
    WebkitBackdropFilter: 'blur(3px)',
  } as any : {};
  const activeNavGlass = Platform.OS === 'web' ? {
    backdropFilter: 'blur(3px)',
    WebkitBackdropFilter: 'blur(3px)',
    transition: 'flex 180ms ease, background-color 180ms ease, border-color 180ms ease',
  } as any : {};
  const bottomNavBackground = mode === 'dark' ? 'rgba(35,35,35,0.82)' : 'rgba(255,255,255,0.82)';
  const ThemeIcon = mode === 'dark' ? Sun : Moon;
  const themeActionLabel = mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';

  const handleLogout = async () => {
    await logout();
    router.replace("/team/login");
  };

  const navigate = (path: string) => {
    router.push(path as any);
    setMoreOpen(false);
  };

  // Desktop sidebar
  if (showSidebar) {
    return (
      <View nativeID={portalRootId} style={{ flex: 1, flexDirection: "row", backgroundColor: ui.colors.background }}>
        {/* Sidebar */}
        <View
          style={{
            width: sidebarOpen ? sidebarWidth : 68,
            ...glassSurface,
            backgroundColor: ui.colors.sidebar,
            borderRightWidth: 1,
            borderRightColor: ui.colors.border,
            paddingTop: 18,
            paddingBottom: 14,
          }}
        >
          {/* Header */}
          <View style={{ paddingHorizontal: 12, marginBottom: 24 }}>
            {sidebarOpen ? (
              <View>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 9,
                    }}
                  >
                    <View
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: 13,
                        backgroundColor: ui.colors.primary,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text
                        style={{
                          color: ui.colors.onPrimary,
                          fontSize: 15,
                          fontWeight: "800",
                        }}
                      >
                        {teamInitial}
                      </Text>
                    </View>
                    <View>
                      <Text
                        style={{
                          color: ui.colors.text,
                          fontSize: 16,
                          fontWeight: "700",
                        }}
                        numberOfLines={1}
                      >
                        {context?.team_name || "Team Portal"}
                      </Text>
                      <Text
                        style={{
                          color: ui.colors.textMuted,
                          fontSize: 10,
                          marginTop: 1,
                        }}
                      >
                        Team workspace
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => setSidebarOpen(false)}
                    hitSlop={8}
                    style={{ width: 32, height: 32, borderRadius: 9, borderWidth: 1, borderColor: ui.colors.border, backgroundColor: ui.colors.surface, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <PanelLeftClose size={16} color={ui.colors.textMuted} />
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => setSidebarOpen(true)}
                hitSlop={8}
                style={{ alignItems: "center" }}
              >
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 10,
                    backgroundColor: ui.colors.primary,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      color: ui.colors.onPrimary,
                      fontSize: 15,
                      fontWeight: "800",
                    }}
                  >
                    {teamInitial}
                  </Text>
                </View>
                <PanelLeftOpen
                  size={15}
                  color={ui.colors.textMuted}
                  style={{ marginTop: 8 }}
                />
              </TouchableOpacity>
            )}
          </View>

          {/* Nav items */}
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 4, paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
            {sidebarOpen && <Text style={{ color: ui.colors.textMuted, fontSize: 9, fontWeight: '700', paddingHorizontal: 12, marginBottom: 9 }}>PLATFORM</Text>}
            {navItems.map((item) => {
              const active = item.match(pathname);
              const Icon = item.icon;
              return (
                <TouchableOpacity
                  key={item.path}
                  onPress={() => navigate(item.path)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    minHeight: 40,
                    paddingVertical: 7,
                    paddingHorizontal: sidebarOpen ? 12 : 0,
                    justifyContent: sidebarOpen ? "flex-start" : "center",
                    backgroundColor: active ? ui.colors.primarySoft : "transparent",
                    marginHorizontal: sidebarOpen ? 0 : 4,
                    borderRadius: 9,
                    marginBottom: 2,
                    borderWidth: active ? 1 : 0,
                    borderColor: active ? ui.colors.primary : "transparent",
                  }}
                >
                  <Icon
                    size={18}
                    color={active ? ui.colors.primary : ui.colors.textMuted}
                  />
                  {sidebarOpen && (
                    <Text
                      style={{
                        marginLeft: 10,
                        color: active ? ui.colors.primary : ui.colors.text,
                        fontSize: 12,
                        fontWeight: active ? "700" : "400",
                      }}
                    >
                      {item.label}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Logout */}
          <TouchableOpacity
            onPress={handleLogout}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingVertical: 10,
              paddingHorizontal: sidebarOpen ? 12 : 0,
              justifyContent: sidebarOpen ? "flex-start" : "center",
              marginHorizontal: sidebarOpen ? 12 : 8,
              borderRadius: 15,
              marginTop: 8,
              minHeight: 52,
              backgroundColor: ui.colors.surface,
              borderWidth: 1,
              borderColor: ui.colors.border,
            }}
          >
            <LogOut size={18} color={ui.colors.textMuted} />
            {sidebarOpen && (
              <Text
                style={{
                  marginLeft: 10,
                  color: ui.colors.text,
                  fontSize: 12,
                }}
              >
                Logout
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Main content */}
        <View style={{ flex: 1, minWidth: 0, backgroundColor: ui.colors.background }}>
          {/* Top bar */}
          <View
            style={{
              minHeight: 76,
              backgroundColor: 'transparent',
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: width < 900 ? 16 : 28,
            }}
          >
            <View>
              <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: ui.colors.primary }}>
                {context?.team_name || 'Team workspace'}
              </Text>
              <Text style={{ fontSize: 20, lineHeight: 26, fontWeight: '700', color: ui.colors.text }}>
                {navItems.find((item) => item.match(pathname))?.label || 'Team Portal'}
              </Text>
            </View>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
            >
              <TouchableOpacity
                onPress={toggleMode}
                accessibilityRole="button"
                accessibilityLabel={themeActionLabel}
                style={{ ...iconGlassSurface, width: 40, height: 40, borderRadius: 20, backgroundColor: ui.colors.surfaceGlass, borderWidth: 1, borderColor: ui.colors.border, alignItems: "center", justifyContent: "center" }}
              >
                <ThemeIcon size={17} color={ui.colors.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => navigate("/team/profile")}
                accessibilityLabel="Open team profile"
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  backgroundColor: ui.colors.primarySoft,
                  borderWidth: 1,
                  borderColor: ui.colors.border,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                  <Text
                  style={{ color: ui.colors.primary, fontSize: 13, fontWeight: "700" }}
                >
                  {teamInitial}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView
            style={{ flex: 1, backgroundColor: ui.colors.background }}
            contentContainerStyle={{ padding: width < 900 ? 14 : 20 }}
          >
            {children}
          </ScrollView>
        </View>
      </View>
    );
  }

  // Mobile layout
  return (
    <View nativeID={portalRootId} style={{ flex: 1, backgroundColor: ui.colors.background }}>
      {!hideMobileHeader && (
        <View style={{ backgroundColor: 'transparent', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <TouchableOpacity onPress={() => navigate('/team/profile')} accessibilityRole="button" accessibilityLabel={`Open ${context?.team_name || 'team'} profile`}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: ui.colors.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: ui.colors.onPrimary, fontWeight: '700' }}>{teamInitial}</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity onPress={toggleMode} accessibilityRole="button" accessibilityLabel={themeActionLabel}
              style={{ ...iconGlassSurface, width: 42, height: 42, borderRadius: 21, backgroundColor: ui.colors.surfaceGlass, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: ui.colors.border, shadowColor: ui.shadow.shadowColor, shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 }}>
              <ThemeIcon size={18} color={ui.colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigate('/team/announcements')} accessibilityRole="button" accessibilityLabel="Open announcements"
              style={{ ...iconGlassSurface, width: 42, height: 42, borderRadius: 21, backgroundColor: ui.colors.surfaceGlass, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: ui.colors.border, shadowColor: ui.shadow.shadowColor, shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 }}>
              <MessageSquare size={19} color={ui.colors.text} />
            </TouchableOpacity>
          </View>
        </View>
      )}
      {/* Mobile content has its own composition and room for the floating navigation. */}
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={!mobileEdgeToEdge} contentContainerStyle={{ paddingHorizontal: mobileEdgeToEdge ? 0 : 16, paddingTop: mobileEdgeToEdge ? 0 : 4, paddingBottom: 112 }}>
        {children}
      </ScrollView>

      {/* Mobile bottom nav */}
      <View
        style={{
          flexDirection: "row",
          ...glassSurface,
          backgroundColor: bottomNavBackground,
          position: 'absolute', bottom: Platform.OS === 'ios' ? 22 : 14, left: 12, right: 12,
          maxWidth: 540, alignSelf: 'center', marginHorizontal: 'auto',
          borderWidth: 1, borderColor: ui.colors.border, borderRadius: 999,
          paddingVertical: 7, paddingHorizontal: 7,
          ...ui.shadow,
        }}
      >
        {[
          ...navItems.slice(0, 4),
          {
            label: "More",
            shortLabel: "More",
            path: "/team/more",
            icon: Menu,
            match: () => moreOpen,
          },
        ].map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          return (
            <TouchableOpacity
              key={item.path}
              accessibilityRole="button" accessibilityLabel={item.label} accessibilityState={{ selected: active }}
              onPress={() =>
                item.path === "/team/more"
                  ? setMoreOpen(true)
                  : navigate(item.path)
              }
              style={{
                flex: active ? 1.7 : 1,
                flexDirection: 'row', gap: 5, borderRadius: 999,
                ...activeNavGlass,
                backgroundColor: active ? ui.colors.primaryStrong : 'transparent',
                borderWidth: active ? 1 : 0,
                borderColor: active ? 'rgba(255,255,255,0.28)' : 'transparent',
                alignItems: "center", justifyContent: "center", minHeight: 46,
              }}
            >
              <Icon
                size={20}
                color={active ? ui.colors.navSelectedText : ui.colors.textMuted}
              />
              {active ? <Text numberOfLines={1} style={{ fontSize: 10, color: ui.colors.navSelectedText, fontWeight: '700' }}>{item.shortLabel || item.label}</Text> : null}
            </TouchableOpacity>
          );
        })}
      </View>

      <Modal visible={moreOpen} transparent animationType="slide" onRequestClose={() => setMoreOpen(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable accessibilityLabel="Close team menu" onPress={() => setMoreOpen(false)}
            style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: ui.colors.overlay }} />
          <View style={{ ...glassSurface, maxHeight: '88%', backgroundColor: ui.colors.surfaceGlass, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' }}>
            <View style={{ width: 58, height: 6, borderRadius: 3, backgroundColor: ui.colors.borderStrong, alignSelf: 'center', marginTop: 14 }} />
            <View style={{ minHeight: 68, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: ui.colors.border }}>
              <View>
                <Text style={{ color: ui.colors.text, fontSize: 20, fontWeight: '700' }}>Team menu</Text>
                <Text style={{ color: ui.colors.textMuted, fontSize: 10 }}>Team Leader Portal</Text>
              </View>
              <TouchableOpacity accessibilityLabel="Close team menu" onPress={() => setMoreOpen(false)}
                style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: ui.colors.surfaceMuted, borderWidth: 1, borderColor: ui.colors.border, alignItems: 'center', justifyContent: 'center' }}>
                <X size={18} color={ui.colors.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {navItems.slice(4).map((item) => {
                const Icon = item.icon;
                const active = item.match(pathname);
                return <TouchableOpacity key={item.path} onPress={() => navigate(item.path)}
                  style={{ width: '48%', minHeight: 112, borderRadius: 16, borderWidth: 1, borderColor: active ? ui.colors.borderStrong : ui.colors.border, backgroundColor: active ? ui.colors.navActive : ui.colors.surface, alignItems: 'center', justifyContent: 'center', padding: 12 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: active ? ui.colors.surfaceStrong : ui.colors.surfaceMuted, alignItems: 'center', justifyContent: 'center', marginBottom: 9 }}>
                    <Icon size={20} color={active ? ui.colors.navActiveText : ui.colors.textMuted} />
                  </View>
                  <Text style={{ color: active ? ui.colors.navActiveText : ui.colors.textMuted, fontSize: 12, fontWeight: '700', textAlign: 'center' }}>{item.label}</Text>
                </TouchableOpacity>;
              })}
            </ScrollView>
            <TouchableOpacity onPress={handleLogout} style={{ minHeight: 76, borderTopWidth: 1, borderTopColor: ui.colors.border, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: ui.colors.background }}>
              <LogOut size={18} color={ui.colors.danger} />
              <Text style={{ color: ui.colors.danger, fontSize: 13, fontWeight: '700' }}>Logout</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
