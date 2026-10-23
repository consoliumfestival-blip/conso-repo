import { ui } from '@/constants/designSystem';
import { TeamText as Text } from '@/components/team/TeamText';
import React, { useState } from "react";
import { Modal, Platform, Pressable, ScrollView, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import {
  CalendarDays,
  ClipboardList,
  Home,
  LogOut,
  Menu,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
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
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { width } = useWindowDimensions();
  const { context } = useTeamLeaderContext();

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

  const isDesktop = width >= 900;

  const handleLogout = async () => {
    await logout();
    router.replace("/team/login");
  };

  const navigate = (path: string) => {
    router.push(path as any);
    setMoreOpen(false);
  };

  // Desktop sidebar
  if (isDesktop) {
    return (
      <View style={{ flex: 1, flexDirection: "row", backgroundColor: ui.colors.background }}>
        {/* Sidebar */}
        <View
          style={{
            width: sidebarOpen ? 264 : 68,
            backgroundColor: '#FBFBFC',
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
                          color: ui.colors.surface,
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
                      color: ui.colors.surface,
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
                    borderColor: active ? '#B9E5DE' : "transparent",
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
                        color: active ? ui.colors.primary : '#334155',
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
              backgroundColor: ui.colors.surface,
              borderBottomWidth: 1,
              borderBottomColor: ui.colors.border,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 28,
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
            contentContainerStyle={{ padding: 20 }}
          >
            {children}
          </ScrollView>
        </View>
      </View>
    );
  }

  // Mobile layout
  return (
    <View style={{ flex: 1, backgroundColor: ui.colors.background }}>
      {/* Content */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 88 }}>
        {children}
      </ScrollView>

      {/* Mobile bottom nav */}
      <View
        style={{
          flexDirection: "row",
          backgroundColor: ui.colors.surface,
          borderTopWidth: 1,
          borderTopColor: ui.colors.border,
          paddingBottom: Platform.OS === "ios" ? 20 : 4,
          paddingTop: 4,
          paddingHorizontal: 6,
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
              onPress={() =>
                item.path === "/team/more"
                  ? setMoreOpen(true)
                  : navigate(item.path)
              }
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                minHeight: 58,
              }}
            >
              <Icon
                size={20}
                color={active ? ui.colors.info : ui.colors.textMuted}
              />
              <Text
                style={{
                  fontSize: 9,
                  color: active ? ui.colors.info : ui.colors.textMuted,
                  marginTop: 2,
                  fontWeight: "700",
                }}
              >
                {item.shortLabel || item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Modal visible={moreOpen} transparent animationType="slide" onRequestClose={() => setMoreOpen(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable accessibilityLabel="Close team menu" onPress={() => setMoreOpen(false)}
            style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(15, 23, 42, 0.45)' }} />
          <View style={{ maxHeight: '88%', backgroundColor: ui.colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden' }}>
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
                  style={{ width: '48%', minHeight: 112, borderRadius: 18, borderWidth: 1, borderColor: active ? '#CFE0FF' : ui.colors.border, backgroundColor: active ? '#F4F8FF' : ui.colors.surface, alignItems: 'center', justifyContent: 'center', padding: 12 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: active ? '#E5EFFF' : ui.colors.surfaceMuted, alignItems: 'center', justifyContent: 'center', marginBottom: 9 }}>
                    <Icon size={20} color={active ? ui.colors.info : ui.colors.textMuted} />
                  </View>
                  <Text style={{ color: active ? ui.colors.info : '#40516A', fontSize: 12, fontWeight: '700', textAlign: 'center' }}>{item.label}</Text>
                </TouchableOpacity>;
              })}
            </ScrollView>
            <TouchableOpacity onPress={handleLogout} style={{ minHeight: 76, borderTopWidth: 1, borderTopColor: ui.colors.border, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: '#FBFCFD' }}>
              <LogOut size={18} color={ui.colors.danger} />
              <Text style={{ color: ui.colors.danger, fontSize: 13, fontWeight: '700' }}>Logout</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
