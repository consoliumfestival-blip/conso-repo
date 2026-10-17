import React, { useMemo, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { usePathname, useRouter } from "expo-router";
import {
  Bell,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Home,
  LogOut,
  Menu,
  Megaphone,
  PanelLeftClose,
  PanelLeftOpen,
  PanelsTopLeft,
  Scale,
  Settings,
  ShieldCheck,
  Trophy,
  UserCheck,
  UserCircle,
  Users,
  X,
  Radio,
} from "lucide-react-native";

import { useAuthStore } from "@/core/store/authStore";
import { useFestival } from "@/core/hooks/useFestival";
import { ui } from "@/constants/designSystem";
import { JudgeApprovalToast } from "../ui/JudgeApprovalToast";
import { useJudgeApprovalStore } from "@/core/store/judgeApprovalStore";

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
  children?: {
    label: string;
    path: string;
    match: (pathname: string) => boolean;
  }[];
};

const navItems: NavItem[] = [
  {
    label: "Dashboard",
    shortLabel: "Home",
    path: "/(admin)",
    icon: Home,
    match: (path) => path === "/" || path === "/(admin)" || path === "/admin",
  },
  {
    label: "Participants",
    path: "/(admin)/participants",
    icon: Users,
    match: (path) => path.includes("/participants"),
  },
  {
    label: "Schedules",
    shortLabel: "Schedule",
    path: "/(admin)/schedule",
    icon: CalendarDays,
    match: (path) => path.includes("/schedule"),
  },
  {
    label: "Stage Management",
    shortLabel: "Stage",
    path: "/stage-management",
    icon: PanelsTopLeft,
    match: (path) => path.includes("/stage-management"),
  },
  {
    label: "Sub Organisations",
    path: "/(admin)/organisations",
    icon: Building2,
    match: (path) => path.includes("/organisations"),
  },
  {
    label: "Communication Center",
    path: "/(admin)/communication",
    icon: Megaphone,
    match: (path) => path.includes("/communication"),
  },
  {
    label: "Judge Management",
    path: "/(admin)/judges",
    icon: UserCheck,
    match: (path) => path.includes("/judges"),
  },
  {
    label: "Open Judge Portal",
    path: "/judge",
    icon: Scale,
    match: () => false,
  },
  {
    label: "Team Leader Management",
    path: "/(admin)/team-leaders",
    icon: Users,
    match: (path) => path.includes("/team-leaders"),
  },
  {
    label: "Smart Announcer",
    shortLabel: "Announcer",
    path: "/(admin)/smart-announcer",
    icon: Radio,
    match: (path) => path.includes("/smart-announcer"),
  },
  {
    label: "Leaderboard Management",
    path: "/(admin)/settings/leaderboard",
    icon: Trophy,
    match: (path) => path.includes("/settings/leaderboard"),
    children: [
      {
        label: "Unit Rankings",
        path: "/(admin)/settings/leaderboard/unit-rankings",
        match: (path) =>
          path.includes("/settings/leaderboard/unit-rankings") ||
          path.endsWith("/settings/leaderboard"),
      },
      {
        label: "Leaderboard Controls",
        path: "/(admin)/settings/leaderboard/controls",
        match: (path) => path.includes("/settings/leaderboard/controls"),
      },
      {
        label: "Item Results",
        path: "/(admin)/settings/leaderboard/item-results",
        match: (path) => path.includes("/settings/leaderboard/item-results"),
      },
      {
        label: "Individual Rankings",
        path: "/(admin)/settings/leaderboard/individual-rankings",
        match: (path) =>
          path.includes("/settings/leaderboard/individual-rankings"),
      },
      {
        label: "Poster Studio",
        path: "/(admin)/settings/leaderboard/poster-studio",
        match: (path) => path.includes("/settings/leaderboard/poster-studio"),
      },
      {
        label: "Media Center",
        path: "/(admin)/settings/leaderboard/media-center",
        match: (path) => path.includes("/settings/leaderboard/media-center"),
      },
    ],
  },
  {
    label: "Grace Marks",
    path: "/(admin)/grace-marks",
    icon: Trophy,
    match: (path) => path.includes("/grace-marks"),
  },
  {
    label: "Festival Settings",
    path: "/(admin)/settings/calendar",
    icon: Settings,
    match: (path) =>
      path.includes("/settings") && !path.includes("/settings/leaderboard"),
    children: [
      {
        label: "Festival Calendar",
        path: "/(admin)/settings/calendar",
        match: (path) =>
          path.includes("/settings/calendar") || path.endsWith("/settings"),
      },
      {
        label: "Item Activation",
        path: "/(admin)/settings/items",
        match: (path) => path.includes("/settings/items"),
      },
      {
        label: "Points & Grading",
        path: "/(admin)/settings/points",
        match: (path) => path.includes("/settings/points"),
      },
      {
        label: "Scoring Rules",
        path: "/(admin)/settings/scoring-rules",
        match: (path) => path.includes("/settings/scoring-rules"),
      },
      {
        label: "AI Settings & API Keys",
        path: "/(admin)/settings/api-keys",
        match: (path) => path.includes("/settings/api-keys"),
      },
    ],
  },
];

function getPageTitle(pathname: string) {
  if (pathname.includes("/participants/")) {
    if (pathname.endsWith("/add")) return "Add Participant";
    if (pathname.includes("chest-card")) return "Chest Cards";
    if (pathname.includes("import")) return "Import Participants";
  }
  if (pathname.includes("/schedule/")) {
    if (pathname.endsWith("/bulk-create")) return "Bulk Schedule Builder";
    if (pathname.endsWith("/create")) return "Create Schedule";
    if (pathname.includes("/results")) return "Schedule Results";
    if (pathname.includes("/marks")) return "Enter Marks";
    if (pathname.includes("/checkin")) return "Participant Check-in";
    if (pathname.includes("/code-letter")) return "Code Letters";
  }
  return (
    navItems.find((item) => item.match(pathname))?.label ?? "Festival Admin"
  );
}

function DesktopSidebar({
  pathname,
  collapsed,
  onToggle,
  festivalName,
}: {
  pathname: string;
  collapsed: boolean;
  onToggle: () => void;
  festivalName: string;
}) {
  const router = useRouter();
  const { user, role, logout } = useAuthStore();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const { pendingCount } = useJudgeApprovalStore();

  return (
    <View
      className="no-print"
      style={[styles.sidebar, collapsed && styles.sidebarCollapsed]}
    >
      <View>
        <View style={[styles.brand, collapsed && styles.brandCollapsed]}>
          <View style={styles.brandMark}>
            <ShieldCheck
              size={23}
              color={ui.colors.surface}
              strokeWidth={2.4}
            />
          </View>
          {!collapsed && (
            <View style={{ flex: 1 }}>
              <Text style={styles.brandName} numberOfLines={1}>
                {festivalName}
              </Text>
              <Text style={styles.brandCaption}>Festival workspace</Text>
            </View>
          )}
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={
              collapsed ? "Expand sidebar" : "Collapse sidebar"
            }
            onPress={onToggle}
            style={[
              styles.sidebarToggle,
              collapsed && styles.sidebarToggleCollapsed,
            ]}
          >
            {collapsed ? (
              <PanelLeftOpen size={18} color={ui.colors.textMuted} />
            ) : (
              <PanelLeftClose size={18} color={ui.colors.textMuted} />
            )}
          </TouchableOpacity>
        </View>

        {!collapsed && <Text style={styles.navCaption}>Platform</Text>}
        <ScrollView
          style={styles.sidebarScroll}
          contentContainerStyle={{ paddingBottom: 20 }}
          showsVerticalScrollIndicator={false}
        >
          {navItems.map((item) => {
            const active = item.match(pathname);
            const Icon = item.icon;
            const expanded = item.children
              ? (openGroups[item.label] ?? active)
              : false;
            return (
              <View key={item.label}>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityState={{
                    selected: active,
                    expanded: item.children ? expanded : undefined,
                  }}
                  activeOpacity={0.76}
                  onPress={() => {
                    if (item.children) {
                      if (collapsed) onToggle();
                      setOpenGroups((current) => ({
                        ...current,
                        [item.label]: !expanded,
                      }));
                    } else {
                      router.push(item.path as any);
                    }
                  }}
                  style={[
                    styles.desktopNavItem,
                    collapsed && styles.desktopNavItemCollapsed,
                    active &&
                      (!item.children || collapsed) &&
                      styles.desktopNavItemActive,
                  ]}
                >
                  <Icon
                    size={18}
                    color={active ? ui.colors.primary : ui.colors.textMuted}
                    strokeWidth={active ? 2.35 : 2}
                  />
                  {!collapsed && (
                    <View className="flex-row items-center flex-1">
                      <Text
                        style={[
                          styles.desktopNavLabel,
                          active && styles.desktopNavLabelActive,
                        ]}
                      >
                        {item.label}
                      </Text>
                      {item.label === "Judge Management" &&
                        pendingCount > 0 && (
                          <View className="bg-red-500 rounded-full w-5 h-5 items-center justify-center ml-auto mr-1">
                            <Text className="text-white text-[10px] font-bold">
                              {pendingCount}
                            </Text>
                          </View>
                        )}
                    </View>
                  )}
                  {!collapsed && item.children ? (
                    expanded ? (
                      <ChevronDown size={15} color={ui.colors.textMuted} />
                    ) : (
                      <ChevronRight size={15} color={ui.colors.textMuted} />
                    )
                  ) : null}
                </TouchableOpacity>
                {!collapsed && item.children && expanded && (
                  <View style={styles.desktopSubmenu}>
                    {item.children.map((child) => {
                      const childActive = child.match(pathname);
                      return (
                        <TouchableOpacity
                          key={child.label}
                          accessibilityRole="button"
                          accessibilityState={{ selected: childActive }}
                          onPress={() => router.push(child.path as any)}
                          style={[
                            styles.desktopSubmenuItem,
                            childActive && styles.desktopSubmenuItemActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.desktopSubmenuLabel,
                              childActive && styles.desktopSubmenuLabelActive,
                            ]}
                          >
                            {child.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      </View>

      <View
        style={[
          styles.sidebarFooter,
          collapsed && styles.sidebarFooterCollapsed,
        ]}
      >
        <View style={styles.avatar}>
          <UserCircle size={26} color={ui.colors.primary} />
        </View>
        {!collapsed && (
          <>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={styles.profileName}>
                {user?.user_metadata?.full_name ||
                  user?.email?.split("@")[0] ||
                  "Festival Admin"}
              </Text>
              <Text style={styles.profileRole}>{role || "admin"}</Text>
            </View>
            <TouchableOpacity
              accessibilityLabel="Sign out"
              accessibilityRole="button"
              onPress={logout}
              style={styles.logoutButton}
            >
              <LogOut size={17} color={ui.colors.textMuted} />
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

function MobileMenuSheet({
  visible,
  onClose,
  pathname,
}: {
  visible: boolean;
  onClose: () => void;
  pathname: string;
}) {
  const router = useRouter();
  const { user, role } = useAuthStore();
  const { pendingCount } = useJudgeApprovalStore();

  const navigate = (path: string) => {
    onClose();
    setTimeout(() => router.push(path as any), 150);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalRoot}>
        <Pressable style={styles.scrim} onPress={onClose} />
        <SafeAreaView style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.sheetTitle}>Menu</Text>
              <Text style={styles.sheetSubtitle}>Festival workspace</Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Close menu"
              onPress={onClose}
              style={styles.sheetClose}
            >
              <X size={20} color={ui.colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.menuGrid}
          >
            {navItems.map((item) => {
              const active = item.match(pathname);
              const Icon = item.icon;
              const hasChildren = !!item.children;
              // Expand automatically if active, but allow toggling in future if we had state. 
              // Without state, we just show children if the parent is active.
              const expanded = hasChildren && active;

              if (!hasChildren) {
                return (
                  <TouchableOpacity
                    key={item.label}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={item.label}
                    accessibilityState={{ selected: active }}
                    onPress={() => navigate(item.path)}
                    style={[styles.menuTile, active && styles.menuTileActive]}
                  >
                    <View style={[styles.menuIcon, active && styles.menuIconActive]}>
                      <Icon size={22} color={active ? ui.colors.info : "#52647C"} strokeWidth={2} />
                      {item.label === "Judge Management" && pendingCount > 0 && (
                        <View className="absolute -top-1 -right-1 bg-red-500 rounded-full w-4 h-4 items-center justify-center border border-white">
                          <Text className="text-white text-[9px] font-bold">{pendingCount}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.menuTileLabel, active && styles.menuTileLabelActive]}>{item.label}</Text>
                  </TouchableOpacity>
                );
              }

              return (
                <View key={item.label} style={{ width: '100%' }}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={item.label}
                    accessibilityState={{ selected: active }}
                    onPress={() => navigate(item.path)}
                    style={[styles.menuTile, active && styles.menuTileActive, { width: '100%', flexDirection: 'row', alignItems: 'center', minHeight: 70, justifyContent: 'flex-start', paddingHorizontal: 20 }]}
                  >
                    <View
                      style={[styles.menuIcon, active && styles.menuIconActive, { marginBottom: 0, marginRight: 16 }]}
                    >
                      <Icon
                        size={22}
                        color={active ? ui.colors.info : "#52647C"}
                        strokeWidth={2}
                      />
                    </View>
                    <Text
                      style={[
                        styles.menuTileLabel,
                        active && styles.menuTileLabelActive,
                        { flex: 1, textAlign: 'left' }
                      ]}
                    >
                      {item.label}
                    </Text>
                    <ChevronRight size={18} color={ui.colors.textMuted} />
                  </TouchableOpacity>
                  
                  {expanded && (
                    <View style={{ marginLeft: 56, marginTop: -8, marginBottom: 16 }}>
                      {item.children!.map(child => {
                        const childActive = child.match(pathname);
                        return (
                          <TouchableOpacity 
                            key={child.label}
                            onPress={() => navigate(child.path)}
                            style={{ paddingVertical: 12, paddingHorizontal: 16, backgroundColor: childActive ? ui.colors.primarySoft : 'transparent', borderRadius: 12, marginBottom: 4 }}
                          >
                            <Text style={{ fontFamily: childActive ? 'Poppins_600SemiBold' : 'Poppins_500Medium', fontSize: 13, color: childActive ? ui.colors.primary : ui.colors.textMuted }}>
                              {child.label}
                            </Text>
                          </TouchableOpacity>
                        )
                      })}
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>

          <View style={styles.sheetProfile}>
            <View style={styles.sheetAvatar}>
              <Text style={styles.sheetAvatarText}>
                {(user?.email?.[0] || "A").toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={styles.sheetProfileName}>
                {user?.user_metadata?.full_name ||
                  user?.email?.split("@")[0] ||
                  "Festival Admin"}
              </Text>
              <Text style={styles.sheetProfileRole}>{role || "admin"}</Text>
            </View>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function MobileBottomBar({
  pathname,
  onMenu,
}: {
  pathname: string;
  onMenu: () => void;
}) {
  const router = useRouter();
  const primaryItems = navItems.slice(0, 3);

  return (
    <SafeAreaView className="no-print" style={styles.mobileBarSafe}>
      <View style={styles.mobileBar}>
        {primaryItems.map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          return (
            <TouchableOpacity
              key={item.label}
              accessibilityRole="button"
              accessibilityLabel={item.shortLabel || item.label}
              accessibilityState={{ selected: active }}
              onPress={() => router.push(item.path as any)}
              style={styles.mobileTab}
            >
              <View
                style={[
                  styles.mobileTabIcon,
                  active && styles.mobileTabIconActive,
                ]}
              >
                <Icon
                  size={21}
                  color={active ? ui.colors.info : ui.colors.textMuted}
                  strokeWidth={2.2}
                />
              </View>
              <Text
                style={[
                  styles.mobileTabLabel,
                  active && styles.mobileTabLabelActive,
                ]}
              >
                {item.shortLabel || item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Menu"
          onPress={onMenu}
          style={styles.mobileTab}
        >
          <View style={styles.mobileTabIcon}>
            <Menu size={22} color={ui.colors.textMuted} strokeWidth={2.2} />
          </View>
          <Text style={styles.mobileTabLabel}>Menu</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

export function AdminAppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const isDesktop = width >= 900;
  const hasIntegratedSectionHeader = pathname.includes("/settings/leaderboard");
  const pageTitle = useMemo(() => getPageTitle(pathname), [pathname]);
  const { useActiveFestival } = useFestival();
  const { data: activeFestival } = useActiveFestival();
  const festivalName = activeFestival?.custom_name?.trim() || "Sahithyolsav";

  if (pathname.includes("/settings/leaderboard/poster-studio")) {
    return (
      <View style={{ flex: 1, backgroundColor: "#09090b" }}>{children}</View>
    );
  }

  return (
    <View style={styles.shell}>
      <JudgeApprovalToast />
      {isDesktop && (
        <DesktopSidebar
          pathname={pathname}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((current) => !current)}
          festivalName={festivalName}
        />
      )}
      <View style={styles.shellMain}>
        {isDesktop && !hasIntegratedSectionHeader && (
          <View className="no-print" style={styles.topbar}>
            <View>
              <Text style={styles.topbarEyebrow}>{festivalName}</Text>
              <Text style={styles.topbarTitle}>{pageTitle}</Text>
            </View>
            <View style={styles.topbarActions}>
              <TouchableOpacity style={styles.topbarIconButton}>
                <Bell size={19} color={ui.colors.textMuted} />
              </TouchableOpacity>
              <View style={styles.onlinePill}>
                <View style={styles.onlineDot} />
                <Text style={styles.onlineText}>Online</Text>
              </View>
            </View>
          </View>
        )}
        <View style={[styles.content, !isDesktop && styles.mobileContent]}>
          {children}
        </View>
      </View>

      {!isDesktop && (
        <>
          <MobileBottomBar
            pathname={pathname}
            onMenu={() => setMenuOpen(true)}
          />
          <MobileMenuSheet
            visible={menuOpen}
            pathname={pathname}
            onClose={() => setMenuOpen(false)}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: ui.colors.background,
  },
  shellMain: {
    flex: 1,
    minWidth: 0,
    backgroundColor: ui.colors.background,
  },
  content: {
    flex: 1,
    minHeight: 0,
  },
  mobileContent: {
    paddingBottom: Platform.OS === "ios" ? 82 : 72,
  },
  sidebar: {
    width: 264,
    minHeight: "100%",
    backgroundColor: "#FBFBFC",
    borderRightWidth: 1,
    borderRightColor: ui.colors.border,
    paddingHorizontal: 12,
    paddingTop: 18,
    paddingBottom: 14,
    justifyContent: "space-between",
  },
  sidebarCollapsed: {
    width: 68,
    paddingHorizontal: 8,
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 8,
    marginBottom: 24,
  },
  brandCollapsed: {
    flexDirection: "column",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 0,
  },
  brandMark: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: ui.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  brandName: {
    color: ui.colors.text,
    fontFamily: "Poppins_700Bold",
    fontSize: 16,
    lineHeight: 20,
  },
  brandCaption: {
    color: ui.colors.textMuted,
    fontFamily: "Poppins_400Regular",
    fontSize: 10,
  },
  sidebarToggle: {
    width: 32,
    height: 32,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: ui.colors.border,
    backgroundColor: ui.colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  sidebarToggleCollapsed: {
    width: 40,
    height: 34,
  },
  navCaption: {
    color: ui.colors.textMuted,
    fontFamily: "Poppins_700Bold",
    fontSize: 9,
    letterSpacing: 0.2,
    paddingHorizontal: 12,
    marginBottom: 9,
  },
  sidebarScroll: {
    maxHeight: 620,
  },
  desktopNavItem: {
    minHeight: 40,
    borderRadius: 9,
    paddingHorizontal: 12,
    marginBottom: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  desktopNavItemCollapsed: {
    width: 44,
    minHeight: 42,
    alignSelf: "center",
    justifyContent: "center",
    paddingHorizontal: 0,
  },
  desktopNavItemActive: {
    backgroundColor: ui.colors.primarySoft,
  },
  desktopNavLabel: {
    color: "#334155",
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    flex: 1,
  },
  desktopNavLabelActive: {
    color: ui.colors.primary,
    fontFamily: "Poppins_700Bold",
  },
  desktopSubmenu: {
    marginLeft: 22,
    paddingLeft: 15,
    paddingVertical: 3,
    marginBottom: 5,
    borderLeftWidth: 1,
    borderLeftColor: ui.colors.borderStrong,
  },
  desktopSubmenuItem: {
    minHeight: 34,
    borderRadius: 8,
    justifyContent: "center",
    paddingHorizontal: 10,
    marginVertical: 1,
  },
  desktopSubmenuItemActive: {
    backgroundColor: ui.colors.surfaceMuted,
  },
  desktopSubmenuLabel: {
    color: ui.colors.textMuted,
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
  },
  desktopSubmenuLabelActive: {
    color: ui.colors.text,
    fontFamily: "Poppins_700Bold",
  },
  sidebarFooter: {
    minHeight: 62,
    padding: 10,
    borderRadius: 15,
    backgroundColor: ui.colors.surface,
    borderWidth: 1,
    borderColor: ui.colors.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  sidebarFooterCollapsed: {
    minHeight: 52,
    padding: 6,
    justifyContent: "center",
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: ui.colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  profileName: {
    color: ui.colors.text,
    fontFamily: "Poppins_700Bold",
    fontSize: 11,
  },
  profileRole: {
    color: ui.colors.textMuted,
    fontFamily: "Poppins_400Regular",
    fontSize: 9,
    textTransform: "capitalize",
  },
  logoutButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  topbar: {
    minHeight: 76,
    backgroundColor: ui.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: ui.colors.border,
    paddingHorizontal: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    ...Platform.select({
      web: { position: "sticky" as any, top: 0, zIndex: 10 },
      default: {},
    }),
  },
  topbarEyebrow: {
    color: ui.colors.primary,
    fontFamily: "Poppins_700Bold",
    fontSize: 9,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  topbarTitle: {
    color: ui.colors.text,
    fontFamily: "Poppins_700Bold",
    fontSize: 20,
    lineHeight: 26,
  },
  topbarActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  topbarIconButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ui.colors.border,
    backgroundColor: ui.colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  onlinePill: {
    height: 34,
    borderRadius: 17,
    paddingHorizontal: 11,
    backgroundColor: ui.colors.successSoft,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: ui.colors.success,
  },
  onlineText: {
    color: ui.colors.success,
    fontFamily: "Poppins_700Bold",
    fontSize: 10,
  },
  mobileBarSafe: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 40,
    backgroundColor: ui.colors.surface,
    borderTopWidth: 1,
    borderTopColor: ui.colors.border,
    ...ui.shadow,
  },
  mobileBar: {
    height: 66,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  mobileTab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 58,
  },
  mobileTabIcon: {
    minWidth: 42,
    height: 30,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  mobileTabIconActive: {
    backgroundColor: "#EAF2FF",
  },
  mobileTabLabel: {
    color: ui.colors.textMuted,
    fontFamily: "Poppins_700Bold",
    fontSize: 9,
    marginTop: 1,
  },
  mobileTabLabelActive: {
    color: ui.colors.info,
  },
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: ui.colors.surfaceStrong,
  },
  sheet: {
    width: "100%",
    maxHeight: "88%",
    backgroundColor: ui.colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: "hidden",
  },
  sheetHandle: {
    width: 58,
    height: 6,
    borderRadius: 3,
    backgroundColor: ui.colors.borderStrong,
    alignSelf: "center",
    marginTop: 14,
  },
  sheetHeader: {
    minHeight: 68,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: ui.colors.border,
  },
  sheetTitle: {
    color: ui.colors.text,
    fontFamily: "Poppins_700Bold",
    fontSize: 20,
  },
  sheetSubtitle: {
    color: ui.colors.textMuted,
    fontFamily: "Poppins_400Regular",
    fontSize: 10,
  },
  sheetClose: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: ui.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: ui.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  menuGrid: {
    padding: 16,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  menuTile: {
    width: "48.5%",
    minHeight: 112,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: ui.colors.border,
    backgroundColor: ui.colors.surface,
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
  },
  menuTileActive: {
    backgroundColor: "#F4F8FF",
    borderColor: "#CFE0FF",
  },
  menuIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: ui.colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 9,
  },
  menuIconActive: {
    backgroundColor: "#E5EFFF",
  },
  menuTileLabel: {
    color: "#40516A",
    fontFamily: "Poppins_700Bold",
    fontSize: 12,
    textAlign: "center",
  },
  menuTileLabelActive: {
    color: ui.colors.info,
  },
  sheetProfile: {
    minHeight: 76,
    borderTopWidth: 1,
    borderTopColor: ui.colors.border,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    backgroundColor: "#FBFCFD",
  },
  sheetAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: ui.colors.infoSoft,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    alignItems: "center",
    justifyContent: "center",
  },
  sheetAvatarText: {
    color: ui.colors.info,
    fontFamily: "Poppins_700Bold",
    fontSize: 17,
  },
  sheetProfileName: {
    color: ui.colors.text,
    fontFamily: "Poppins_700Bold",
    fontSize: 13,
  },
  sheetProfileRole: {
    color: ui.colors.textMuted,
    fontFamily: "Poppins_400Regular",
    fontSize: 10,
    textTransform: "capitalize",
  },
});
