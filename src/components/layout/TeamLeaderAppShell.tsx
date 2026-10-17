import { ui } from '@/constants/designSystem';
import React, { useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { usePathname, useRouter } from "expo-router";
import {
  CalendarDays,
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const { width } = useWindowDimensions();
  const { context } = useTeamLeaderContext();
  const teamPrimary = context?.portal_primary_color || "#0F766E";
  const teamAccent = context?.portal_accent_color || "#14B8A6";
  const teamInitial = (context?.team_name || "T")
    .trim()
    .charAt(0)
    .toUpperCase();

  const isDesktop = width >= 768;

  const handleLogout = async () => {
    await logout();
    router.replace("/team/login");
  };

  const navigate = (path: string) => {
    router.push(path as any);
    setMobileMenuOpen(false);
  };

  // Desktop sidebar
  if (isDesktop) {
    return (
      <View style={{ flex: 1, flexDirection: "row" }}>
        {/* Sidebar */}
        <View
          style={{
            width: sidebarOpen ? 260 : 58,
            backgroundColor: teamPrimary,
            paddingTop: 16,
            paddingBottom: 16,
          }}
        >
          {/* Header */}
          <View style={{ paddingHorizontal: 12, marginBottom: 18 }}>
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
                        width: 30,
                        height: 30,
                        borderRadius: 10,
                        backgroundColor: teamAccent,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text
                        style={{
                          color: teamPrimary,
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
                          color: ui.colors.surface,
                          fontSize: 13,
                          fontWeight: "800",
                        }}
                        numberOfLines={1}
                      >
                        {context?.team_name || "Team Portal"}
                      </Text>
                      <Text
                        style={{
                          color: "rgba(255,255,255,0.62)",
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
                  >
                    <PanelLeftClose size={16} color="rgba(255,255,255,0.65)" />
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
                    backgroundColor: teamAccent,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      color: teamPrimary,
                      fontSize: 15,
                      fontWeight: "800",
                    }}
                  >
                    {teamInitial}
                  </Text>
                </View>
                <PanelLeftOpen
                  size={15}
                  color="rgba(255,255,255,0.65)"
                  style={{ marginTop: 8 }}
                />
              </TouchableOpacity>
            )}
          </View>

          {/* Nav items */}
          <View style={{ flex: 1 }}>
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
                    paddingVertical: 10,
                    paddingHorizontal: sidebarOpen ? 12 : 0,
                    justifyContent: sidebarOpen ? "flex-start" : "center",
                    backgroundColor: active ? `${teamAccent}33` : "transparent",
                    marginHorizontal: sidebarOpen ? 8 : 4,
                    borderRadius: 8,
                    marginBottom: 4,
                    borderWidth: active ? 1 : 0,
                    borderColor: active ? `${teamAccent}66` : "transparent",
                  }}
                >
                  <Icon
                    size={18}
                    color={active ? teamAccent : "hsl(215, 20.2%, 65.1%)"}
                  />
                  {sidebarOpen && (
                    <Text
                      style={{
                        marginLeft: 10,
                        color: active
                          ? "hsl(210, 40%, 98%)"
                          : "hsl(213, 27%, 84%)",
                        fontSize: 13,
                        fontWeight: active ? "600" : "400",
                      }}
                    >
                      {item.label}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Logout */}
          <TouchableOpacity
            onPress={handleLogout}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingVertical: 10,
              paddingHorizontal: sidebarOpen ? 12 : 0,
              justifyContent: sidebarOpen ? "flex-start" : "center",
              marginHorizontal: sidebarOpen ? 8 : 4,
              borderRadius: 8,
              marginTop: 8,
            }}
          >
            <LogOut size={18} color="hsl(215, 20.2%, 65.1%)" />
            {sidebarOpen && (
              <Text
                style={{
                  marginLeft: 10,
                  color: "hsl(213, 27%, 84%)",
                  fontSize: 13,
                }}
              >
                Logout
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Main content */}
        <View style={{ flex: 1, backgroundColor: "hsl(var(--background))" }}>
          {/* Top bar */}
          <View
            style={{
              height: 64,
              backgroundColor: "hsl(var(--card))",
              borderBottomWidth: 1,
              borderBottomColor: teamAccent,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 20,
            }}
          >
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
            >
              <View
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 99,
                  backgroundColor: teamAccent,
                }}
              />
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "700",
                  color: "hsl(var(--foreground))",
                }}
              >
                {context?.team_name ||
                  (context?.festival_id ? "Festival Portal" : "Team Portal")}
              </Text>
            </View>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
            >
              <TouchableOpacity
                accessibilityLabel="Open notifications"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  backgroundColor: `${teamAccent}12`,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <MessageSquare size={15} color={teamPrimary} />
              </TouchableOpacity>
              <View
                style={{
                  paddingHorizontal: 9,
                  paddingVertical: 4,
                  borderRadius: 999,
                  backgroundColor: `${teamAccent}18`,
                }}
              >
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: "700",
                    color: teamPrimary,
                  }}
                >
                  LIVE
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => navigate("/team/profile")}
                accessibilityLabel="Open team profile"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  backgroundColor: teamPrimary,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{ color: ui.colors.surface, fontSize: 13, fontWeight: "800" }}
                >
                  {teamInitial}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView
            style={{ flex: 1, backgroundColor: "#F7F9FA" }}
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
    <View style={{ flex: 1, backgroundColor: "hsl(var(--background))" }}>
      {/* Mobile top bar */}
      <View
        style={{
          height: 48,
          backgroundColor: "hsl(var(--card))",
          borderBottomWidth: 1,
          borderBottomColor: "hsl(var(--border))",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 16,
        }}
      >
        <TouchableOpacity onPress={() => setMobileMenuOpen(true)} hitSlop={8}>
          <Menu size={20} color="hsl(var(--foreground))" />
        </TouchableOpacity>
        <Text
          style={{
            fontSize: 14,
            fontWeight: "700",
            color: "hsl(var(--foreground))",
          }}
          numberOfLines={1}
        >
          {context?.team_name || "Team Portal"}
        </Text>
        <TouchableOpacity
          onPress={() => navigate("/team/profile")}
          accessibilityLabel="Open team profile"
          style={{
            width: 30,
            height: 30,
            borderRadius: 9,
            backgroundColor: teamPrimary,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: ui.colors.surface, fontSize: 12, fontWeight: "800" }}>
            {teamInitial}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 50,
          }}
        >
          <Pressable
            onPress={() => setMobileMenuOpen(false)}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0,0,0,0.5)",
            }}
          />
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              bottom: 0,
              width: 260,
              backgroundColor: teamPrimary,
              paddingTop: 16,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                paddingHorizontal: 16,
                marginBottom: 16,
              }}
            >
              <Text
                style={{
                  color: "hsl(215, 20.2%, 65.1%)",
                  fontSize: 11,
                  fontWeight: "600",
                  textTransform: "uppercase",
                }}
              >
                Team Portal
              </Text>
              <TouchableOpacity onPress={() => setMobileMenuOpen(false)}>
                <X size={18} color="hsl(215, 20.2%, 65.1%)" />
              </TouchableOpacity>
            </View>
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
                    paddingVertical: 12,
                    paddingHorizontal: 16,
                    backgroundColor: active ? `${teamAccent}33` : "transparent",
                  }}
                >
                  <Icon
                    size={18}
                    color={active ? teamAccent : "hsl(215, 20.2%, 65.1%)"}
                  />
                  <Text
                    style={{
                      marginLeft: 12,
                      color: active
                        ? "hsl(210, 40%, 98%)"
                        : "hsl(213, 27%, 84%)",
                      fontSize: 14,
                      fontWeight: active ? "600" : "400",
                    }}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <View
              style={{
                borderTopWidth: 1,
                borderTopColor: "rgba(255,255,255,0.1)",
                marginTop: 8,
                paddingTop: 8,
              }}
            >
              <TouchableOpacity
                onPress={handleLogout}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 12,
                  paddingHorizontal: 16,
                }}
              >
                <LogOut size={18} color="hsl(215, 20.2%, 65.1%)" />
                <Text
                  style={{
                    marginLeft: 12,
                    color: "hsl(213, 27%, 84%)",
                    fontSize: 14,
                  }}
                >
                  Logout
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Content */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12 }}>
        {children}
      </ScrollView>

      {/* Mobile bottom nav */}
      <View
        style={{
          flexDirection: "row",
          backgroundColor: "hsl(var(--card))",
          borderTopWidth: 1,
          borderTopColor: "hsl(var(--border))",
          paddingBottom: Platform.OS === "ios" ? 20 : 8,
          paddingTop: 8,
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
              }}
            >
              <Icon
                size={20}
                color={active ? teamPrimary : "hsl(var(--muted-foreground))"}
              />
              <Text
                style={{
                  fontSize: 10,
                  color: active ? teamPrimary : "hsl(var(--muted-foreground))",
                  marginTop: 2,
                  fontWeight: active ? "600" : "400",
                }}
              >
                {item.shortLabel || item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {moreOpen && (
        <View
          style={{
            position: "absolute",
            left: 12,
            right: 12,
            bottom: 74,
            zIndex: 60,
            borderRadius: 16,
            backgroundColor: "hsl(var(--card))",
            borderWidth: 1,
            borderColor: "hsl(var(--border))",
            padding: 8,
            shadowColor: ui.shadow.shadowColor,
            shadowOpacity: 0.14,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 8 },
          }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              paddingHorizontal: 10,
              paddingVertical: 8,
            }}
          >
            <Text
              style={{
                color: "hsl(var(--foreground))",
                fontSize: 13,
                fontWeight: "800",
              }}
            >
              More
            </Text>
            <TouchableOpacity onPress={() => setMoreOpen(false)}>
              <X size={17} color="hsl(var(--muted-foreground))" />
            </TouchableOpacity>
          </View>
          {navItems.slice(4).map((item) => {
            const Icon = item.icon;
            return (
              <TouchableOpacity
                key={item.path}
                onPress={() => {
                  setMoreOpen(false);
                  navigate(item.path);
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  padding: 12,
                  borderRadius: 10,
                }}
              >
                <Icon size={17} color={teamPrimary} />
                <Text
                  style={{
                    marginLeft: 10,
                    color: "hsl(var(--foreground))",
                    fontSize: 13,
                    fontWeight: "600",
                  }}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            onPress={handleLogout}
            style={{
              flexDirection: "row",
              alignItems: "center",
              padding: 12,
              borderTopWidth: 1,
              borderTopColor: "hsl(var(--border))",
              marginTop: 4,
            }}
          >
            <LogOut size={17} color="#DC2626" />
            <Text
              style={{
                marginLeft: 10,
                color: "#DC2626",
                fontSize: 13,
                fontWeight: "700",
              }}
            >
              Logout
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
