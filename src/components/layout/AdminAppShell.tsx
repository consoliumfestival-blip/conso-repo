import { CORE_PALETTES, coreColor } from '@/constants/coreTheme';
import { Modal } from '@/components/ui/CoreModal';
import React, { useMemo, useState } from "react";
import { Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import {
  BadgePlus,
  Bell,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  LayoutDashboard,
  ListMusic,
  Globe2,
  Moon,
  Sun,
  Palette,
  LogOut,
  Menu,
  Megaphone,
  PanelsTopLeft,
  Printer,
  Scale,
  Settings,
  Trophy,
  UserCheck,
  Users,
  X,
} from "lucide-react-native";

import { useAuthStore } from "@/core/store/authStore";
import { useCoreAppearance } from "@/core/contexts/CoreAppearanceContext";
import { useSidebarAppearance } from "@/core/store/coreAppearanceStore";
import { adminNavigationMode } from "@/core/utils/adminNavigationLayout";
import { useTenantFeatures } from "@/core/hooks/useTenantFeatures";
import { useFestival } from "@/core/hooks/useFestival";
import { FEATURE_FLAGS } from "@/core/config/features";
import { ui } from "@/constants/designSystem";
import { JudgeApprovalToast } from "../ui/JudgeApprovalToast";
import { useJudgeApprovalStore } from "@/core/store/judgeApprovalStore";
import { ConsoliumLogo } from "@/components/ui/ConsoliumLogo";
import { applyPortalPwaMetadata } from "@/core/utils/portalPwaMetadata";
import { PortalInstallPrompt } from "@/components/pwa/PortalInstallPrompt";
import { PwaUpdateNotice } from "@/components/pwa/PwaUpdateNotice";
import { AdminCodeReleasePushPrompt } from "@/components/pwa/AdminCodeReleasePushPrompt";

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
    icon: LayoutDashboard,
    match: (path) => path === "/" || path === "/(admin)" || path === "/admin",
  },
  {
    label: "Participants",
    path: "/(admin)/participants",
    icon: Users,
    match: (path) => path === "/(admin)/participants" || path === "/participants",
  },
  {
    label: "Programs",
    path: "/(admin)/participants/programs",
    icon: ListMusic,
    match: (path) => path.includes("/participants/programs"),
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
    label: "Teams",
    path: "/(admin)/organisations",
    icon: Building2,
    match: (path) => path.includes("/organisations"),
  },
  ...(FEATURE_FLAGS.ENABLE_COMMUNICATION_CENTER
    ? [{
        label: "Communication Center",
        path: "/(admin)/communication",
        icon: Megaphone,
        match: (path: string) => path.includes("/communication"),
      }]
    : []),
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
    label: "Portals",
    path: "/(admin)/team-leaders",
    icon: Globe2,
    match: (path) => path.includes("/team-leaders") || path.includes("/settings/team-leader-portal") || path.includes("/smart-announcer") || path.includes("/festival-viewer"),
    children: [
      { label: "Team Leader Management", path: "/(admin)/team-leaders", match: (path) => path.includes("/team-leaders") || path.includes("/settings/team-leader-portal") },
      { label: "Smart Announcer", path: "/(admin)/smart-announcer", match: (path) => path.includes("/smart-announcer") },
      { label: "Festival Viewer", path: "/(admin)/festival-viewer", match: (path) => path.includes("/festival-viewer") },
    ],
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
    icon: BadgePlus,
    match: (path) => path.includes("/grace-marks"),
  },
  {
    label: "Festival Settings",
    path: "/(admin)/settings/calendar",
    icon: Settings,
    match: (path) =>
      path.includes("/settings") && !path.includes("/settings/leaderboard") && !path.includes("/settings/team-leader-portal"),
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
        label: "Appearance",
        path: "/(admin)/settings/appearance",
        match: (path) => path.includes("/settings/appearance"),
      },
      {
        label: "AI Settings & API Keys",
        path: "/(admin)/settings/api-keys",
        match: (path) => path.includes("/settings/api-keys"),
      },
    ],
  },
  {
    label: "Reports & printouts",
    path: "/(admin)/reports",
    icon: Printer,
    match: (path) => path.includes("/reports"),
  },
];

function getPageTitle(pathname: string) {
  if (pathname.includes('/reports')) return 'Reports & printouts';
  if (pathname.includes('/festival-viewer')) return 'Festival Viewer';
  if (pathname.includes('/smart-announcer')) return 'Smart Announcer';
  if (pathname.includes('/team-leaders') || pathname.includes('/settings/team-leader-portal')) return 'Team Leader Management';
  if (pathname.includes('/participants/programs')) return 'Programs';
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

function getTenantNavigation(settings: ReturnType<typeof useTenantFeatures>['settings']): NavItem[] {
  return navItems.flatMap((item) => {
    if (item.label === 'Team Leader Management' && !settings.modules.team_leader_management) return [];
    if (item.label === 'Open Judge Portal' && !settings.modules.judge_portal) return [];
    if (item.label === 'Judge Management' && !settings.modules.judge_portal) return [];
    if (item.label === 'Stage Management' && !settings.modules.stage_management) return [];
    if (item.label === 'Smart Announcer' && !settings.modules.smart_announcer) return [];
    if (!item.children) return [item];
    const children = item.children.filter((child) => {
      if (child.label === 'Poster Studio') return settings.modules.poster_studio;
      if (child.label === 'Media Center') return settings.modules.media_center;
      return true;
    });
    return [{ ...item, children }];
  });
}

function DesktopSidebar({
  pathname,
  items,
  layout = 'desktop',
}: {
  pathname: string;
  items: NavItem[];
  layout?: 'tablet' | 'desktop';
}) {
  const router = useRouter();
  const { logout } = useAuthStore();
  const appearance = useCoreAppearance();
  const sidebarAppearance = useSidebarAppearance();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const { height } = useWindowDimensions();
  const [popup, setPopup] = useState<{ item: NavItem; top: number } | null>(null);
  const scrollOffset = React.useRef(0);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const { pendingCount } = useJudgeApprovalStore();

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setPopup(null), 160);
  };
  React.useEffect(() => () => cancelClose(), []);
  React.useEffect(() => { setPopup(null); }, [pathname]);
  const openPopup = (item: NavItem, index: number) => {
    cancelClose();
    const popupHeight = item.children?.length ? 45 + item.children.length * 43 : 38;
    setPopup({ item, top: Math.max(8, Math.min(52 + index * 38 - scrollOffset.current, height - popupHeight - 24)) });
  };
  const go = (path: string) => {
    setPopup(null);
    router.push(path as any);
  };
  const iconColor = sidebarAppearance === 'dark' ? coreColor('#D7E8E8', 'sidebarText') : CORE_PALETTES[appearance?.appearance.palette || 'teal'].primary;
  const tablet = layout === 'tablet';

  return (
    <View
      className="no-print"
      {...(!tablet ? { onMouseEnter: cancelClose, onMouseLeave: scheduleClose } : {}) as any}
      style={[tablet ? styles.tabletSidebar : styles.sidebar, !tablet && sidebarAppearance === 'light' && styles.sidebarLight]}
    >
      {tablet ? <Pressable accessibilityRole="button" accessibilityLabel="Consolium dashboard" onPress={() => go('/(admin)')} style={styles.tabletBrand}><ConsoliumLogo size={32} borderRadius={10} /><Text numberOfLines={1} style={styles.tabletBrandText}>Consolium</Text></Pressable> : <Pressable accessibilityRole="button" accessibilityLabel="Consolium dashboard" onPress={() => go('/(admin)')} style={styles.railLogo}><ConsoliumLogo size={32} borderRadius={10} /></Pressable>}
      <View style={{ flex: 1, minHeight: 0 }}>
        <ScrollView
          style={styles.sidebarScroll}
          contentContainerStyle={tablet ? { paddingHorizontal: 8, paddingBottom: 4 } : { alignItems: 'center', paddingBottom: 4 }}
          showsVerticalScrollIndicator={false}
          onScroll={(event) => { scrollOffset.current = event.nativeEvent.contentOffset.y; if (popup) setPopup(null); }}
          scrollEventThrottle={32}
        >
          {items.map((item, index) => {
            const active = item.match(pathname);
            const Icon = item.icon;
            if (tablet) {
              const expanded = openGroups[item.label] ?? active;
              return <View key={item.label} style={styles.tabletNavGroup}>
                <View style={[styles.tabletNavRow, active && styles.tabletNavRowActive]}>
                  <Pressable accessibilityRole="button" accessibilityLabel={item.label} accessibilityState={{ selected: active }} onPress={() => go(item.path)} style={styles.tabletNavMain}>
                    <Icon size={16} color={active ? ui.colors.primaryText : ui.colors.textMuted} strokeWidth={2} />
                    <Text numberOfLines={1} style={[styles.tabletNavLabel, active && styles.tabletNavLabelActive]}>{item.shortLabel || item.label}</Text>
                    {item.label === 'Judge Management' && pendingCount > 0 && <Text style={styles.tabletBadge}>{pendingCount}</Text>}
                  </Pressable>
                  {!!item.children?.length && <Pressable accessibilityRole="button" accessibilityLabel={`${expanded ? 'Hide' : 'Show'} ${item.label} pages`} accessibilityState={{ expanded }} onPress={() => setOpenGroups(current => ({ ...current, [item.label]: !expanded }))} style={styles.tabletDisclosure}>{expanded ? <ChevronDown size={14} color={ui.colors.textMuted} /> : <ChevronRight size={14} color={ui.colors.textMuted} />}</Pressable>}
                </View>
                {!!item.children?.length && expanded && <View style={styles.tabletSubmenu}>{item.children.map(child => <Pressable key={child.label} accessibilityRole="button" accessibilityState={{ selected: child.match(pathname) }} onPress={() => go(child.path)} style={[styles.tabletSubmenuLink, child.match(pathname) && styles.tabletSubmenuLinkActive]}><Text numberOfLines={1} style={[styles.tabletSubmenuText, child.match(pathname) && styles.tabletSubmenuTextActive]}>{child.label}</Text></Pressable>)}</View>}
              </View>;
            }
            return (
              <View key={item.label} style={styles.railRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                  accessibilityState={{ selected: active }}
                  onHoverIn={() => openPopup(item, index)}
                  onFocus={() => openPopup(item, index)}
                  onPress={() => go(item.path)}
                  style={[styles.railButton, active && (sidebarAppearance === 'dark' ? styles.railButtonActive : styles.railButtonActiveLight)]}
                >
                  <Icon size={17} color={iconColor} strokeWidth={active ? 2.4 : 1.9} />
                  {active && <View style={styles.railActiveBar} />}
                  {item.label === 'Judge Management' && pendingCount > 0 && <View style={styles.railBadge} />}
                </Pressable>
                {item.children?.length ? <Pressable accessibilityRole="button" accessibilityLabel={`Show ${item.label} pages`} accessibilityState={{ expanded: popup?.item.label === item.label }} onHoverIn={() => openPopup(item, index)} onFocus={() => openPopup(item, index)} onPress={() => popup?.item.label === item.label ? setPopup(null) : openPopup(item, index)} style={[styles.railDisclosure, sidebarAppearance === 'light' && styles.railDisclosureLight]}><ChevronRight size={11} color={iconColor} /></Pressable> : null}
              </View>
            );
          })}
        </ScrollView>
      </View>
      {popup && <View {...{ onMouseEnter: cancelClose } as any} style={[styles.railPopup, !popup.item.children?.length && styles.railTooltip, { top: popup.top }]}>
        <Text numberOfLines={popup.item.children?.length ? undefined : 1} style={[styles.railPopupTitle, !popup.item.children?.length && styles.railTooltipTitle]}>{popup.item.label}</Text>
        {popup.item.children?.map((child, index) => <Pressable key={child.label} accessibilityRole="button" accessibilityLabel={child.label} accessibilityState={{ selected: child.match(pathname) }} onPress={() => go(child.path)} style={[styles.railPopupLink, index > 0 && styles.railPopupLinkDivider, child.match(pathname) && styles.railPopupLinkActive]}><Text style={[styles.railPopupLinkText, child.match(pathname) && styles.railPopupLinkTextActive]}>{child.label}</Text><ChevronRight size={15} color={ui.colors.textMuted} /></Pressable>)}
      </View>}
      <View style={styles.railFooter}>
        <Pressable accessibilityRole="button" accessibilityLabel="Appearance settings" onPress={() => go('/(admin)/settings/appearance')} style={styles.railFooterButton}><Palette size={17} color={iconColor} /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={appearance?.isDark ? 'Use light mode' : 'Use dark mode'} onPress={() => appearance?.setAppearance({ ...appearance.appearance, mode: appearance.isDark ? 'light' : 'dark' })} style={styles.railFooterButton}>{appearance?.isDark ? <Sun size={17} color={iconColor} /> : <Moon size={17} color={iconColor} />}</Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Sign out" onPress={logout} style={styles.railFooterButton}><LogOut size={17} color={iconColor} /></Pressable>
      </View>
    </View>
  );
}

function MobileMenuSheet({
  visible,
  onClose,
  pathname,
  items,
}: {
  visible: boolean;
  onClose: () => void;
  pathname: string;
  items: NavItem[];
}) {
  const router = useRouter();
  const { user, role } = useAuthStore();
  const { pendingCount } = useJudgeApprovalStore();
  const [openGroup, setOpenGroup] = useState<string | null>(null);

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
        <SafeAreaView {...{ dataSet: { coreGlass: 'sheet' } } as any} style={styles.sheet}>
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
            {items.map((item) => {
              const active = item.match(pathname);
              const Icon = item.icon;
              const hasChildren = !!item.children;
              const expanded = hasChildren && (openGroup === item.label || (openGroup === null && active));

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
                      <Icon size={22} color={active ? ui.colors.info : coreColor("#52647C", 'text')} strokeWidth={2} />
                      {item.label === "Judge Management" && pendingCount > 0 && (
                        <View className="absolute -top-1 -right-1 bg-core-danger-action-red-500 rounded-full w-4 h-4 items-center justify-center border border-core-border-white">
                          <Text className="text-core-on-primary-white text-[9px] font-bold">{pendingCount}</Text>
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
                    style={[styles.menuTile, active && styles.menuTileActive, { width: '100%', flexDirection: 'row', alignItems: 'center', minHeight: 70, justifyContent: 'flex-start', paddingLeft: 20, paddingRight: 64 }]}
                  >
                    <View
                      style={[styles.menuIcon, active && styles.menuIconActive, { marginBottom: 0, marginRight: 16 }]}
                    >
                      <Icon
                        size={22}
                        color={active ? ui.colors.info : coreColor("#52647C", 'text')}
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
                  </TouchableOpacity>
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${expanded ? 'Hide' : 'Show'} ${item.label} pages`} accessibilityState={{ expanded }} onPress={() => setOpenGroup(expanded ? '' : item.label)} style={{ position: 'absolute', right: 12, top: 10, width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
                    {expanded ? <ChevronDown size={18} color={ui.colors.textMuted} /> : <ChevronRight size={18} color={ui.colors.textMuted} />}
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
                            <Text style={{ fontFamily: childActive ? 'Poppins_600SemiBold' : 'Poppins_500Medium', fontSize: 13, color: childActive ? ui.colors.primaryText : ui.colors.textMuted }}>
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
              <ConsoliumLogo size={36} borderRadius={18} />
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
  items,
}: {
  pathname: string;
  onMenu: () => void;
  items: NavItem[];
}) {
  const router = useRouter();
  const primaryItems = items.slice(0, 3);

  return (
    <SafeAreaView {...{ dataSet: { coreGlass: 'navigation' } } as any} className="no-print" style={styles.mobileBarSafe}>
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
  const tenantId = useAuthStore((state) => state.tenant_id);
  const { settings: tenantFeatures } = useTenantFeatures(tenantId);
  const { width } = useWindowDimensions();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigationMode = adminNavigationMode(width);
  const showSidebar = navigationMode !== 'phone';
  const isDesktop = navigationMode === 'desktop';
  const visibleNavItems = useMemo(() => getTenantNavigation(tenantFeatures), [tenantFeatures]);
  const hasIntegratedSectionHeader = pathname.includes("/settings/leaderboard");
  const pageTitle = useMemo(() => getPageTitle(pathname), [pathname]);
  const { useActiveFestival } = useFestival();
  const { data: activeFestival } = useActiveFestival();
  const festivalName = activeFestival?.custom_name?.trim() || "Consolium";

  React.useEffect(() => {
    if (pathname.startsWith('/stage-management/venue/')) return;
    return applyPortalPwaMetadata(pathname === '/team-leaders' ? 'team-management' : 'admin');
  }, [pathname]);

  return (
    <View style={styles.shell}>
      <JudgeApprovalToast />
      {showSidebar && (
        <DesktopSidebar
          pathname={pathname}
          items={visibleNavItems}
          layout={navigationMode === 'tablet' ? 'tablet' : 'desktop'}
        />
      )}
      <View style={styles.shellMain}>
        {isDesktop && !hasIntegratedSectionHeader && (
          <View {...{ dataSet: { coreGlass: 'navigation' } } as any} className="no-print" style={styles.topbar}>
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
        <View style={[styles.content, !showSidebar && styles.mobileContent]}>
          {(pathname === "/" || pathname === "/(admin)" || pathname === "/admin") && <PortalInstallPrompt portal="main" />}
          {pathname === "/team-leaders" && <PortalInstallPrompt portal="team-management" />}
          {children}
        </View>
      </View>

      {!showSidebar && (
        <>
          <MobileBottomBar
            pathname={pathname}
            onMenu={() => setMenuOpen(true)}
            items={visibleNavItems}
          />
          <MobileMenuSheet
            visible={menuOpen}
            pathname={pathname}
            onClose={() => setMenuOpen(false)}
            items={visibleNavItems}
          />
        </>
      )}
      <PwaUpdateNotice bottomOffset={showSidebar ? 16 : 92} />
      <AdminCodeReleasePushPrompt />
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
    width: 48,
    backgroundColor: coreColor('#102A2E', 'sidebar'),
    margin: 8,
    borderRadius: 18,
    paddingHorizontal: 3,
    paddingTop: 7,
    paddingBottom: 7,
    justifyContent: "space-between",
    zIndex: 30,
    overflow: 'visible',
  },
  tabletSidebar: { width: 224, marginVertical: 8, marginLeft: 8, marginRight: 4, paddingVertical: 10, borderRadius: 16, borderWidth: 1, borderColor: coreColor('#D9E4E2', 'border'), backgroundColor: coreColor('#FFFFFF', 'surface'), ...ui.shadow },
  tabletBrand: { height: 46, paddingHorizontal: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 9 },
  tabletBrandText: { flex: 1, color: ui.colors.text, fontFamily: 'Poppins_700Bold', fontSize: 13 },
  tabletNavGroup: { marginBottom: 3 },
  tabletNavRow: { minHeight: 38, borderRadius: 9, flexDirection: 'row', alignItems: 'center' },
  tabletNavRowActive: { backgroundColor: ui.colors.primarySoft },
  tabletNavMain: { flex: 1, minWidth: 0, minHeight: 38, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 9 },
  tabletNavLabel: { flex: 1, color: ui.colors.textMuted, fontFamily: 'Poppins_500Medium', fontSize: 10 },
  tabletNavLabelActive: { color: ui.colors.primaryText, fontFamily: 'Poppins_700Bold' },
  tabletBadge: { color: ui.colors.onPrimary, backgroundColor: ui.colors.dangerAction, overflow: 'hidden', borderRadius: 8, paddingHorizontal: 5, fontSize: 9 },
  tabletDisclosure: { width: 34, height: 38, alignItems: 'center', justifyContent: 'center' },
  tabletSubmenu: { marginLeft: 18, paddingLeft: 8, borderLeftWidth: 1, borderLeftColor: ui.colors.border, marginBottom: 4 },
  tabletSubmenuLink: { minHeight: 30, paddingHorizontal: 8, justifyContent: 'center', borderRadius: 7 },
  tabletSubmenuLinkActive: { backgroundColor: ui.colors.surfaceMuted },
  tabletSubmenuText: { color: ui.colors.textMuted, fontFamily: 'Poppins_400Regular', fontSize: 9 },
  tabletSubmenuTextActive: { color: ui.colors.primaryText, fontFamily: 'Poppins_700Bold' },
  sidebarLight: { backgroundColor: coreColor('#FFFFFF', 'surface'), borderWidth: 1, borderColor: coreColor('#D9E4E2', 'border'), ...ui.shadow },
  railLogo: { width: 40, height: 40, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  railRow: { width: 40, height: 38, alignItems: 'center', justifyContent: 'center' },
  railButton: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  railButtonActive: { backgroundColor: coreColor('#17383D', 'sidebarSoft') },
  railButtonActiveLight: { backgroundColor: coreColor('#E5F4F0', 'primarySoft') },
  railActiveBar: { position: 'absolute', left: -4, width: 3, height: 24, borderRadius: 3, backgroundColor: coreColor('#54D9B5', 'primary') },
  railBadge: { position: 'absolute', top: 6, right: 6, width: 7, height: 7, borderRadius: 4, backgroundColor: '#FF776F' },
  railDisclosure: { position: 'absolute', bottom: -2, right: -1, width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: coreColor('#17383D', 'sidebarSoft') },
  railDisclosureLight: { backgroundColor: coreColor('#E5F4F0', 'primarySoft') },
  railPopup: { position: 'absolute', left: 40, minWidth: 232, maxWidth: 290, padding: 12, borderRadius: 14, backgroundColor: coreColor('#FFFFFF', 'surface'), borderWidth: 1, borderColor: coreColor('#D6E3E3', 'border'), ...ui.shadow },
  railTooltip: { minWidth: 0, width: 'max-content' as any, maxWidth: 240, paddingVertical: 4, paddingHorizontal: 8 },
  railTooltipTitle: { fontFamily: 'Poppins_500Medium', fontSize: 10, paddingHorizontal: 0, paddingVertical: 0 },
  railPopupTitle: { color: ui.colors.text, fontFamily: 'Poppins_700Bold', fontSize: 13, paddingHorizontal: 8, paddingVertical: 7 },
  railPopupLink: { minHeight: 42, borderRadius: 9, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  railPopupLinkDivider: { borderTopWidth: 1, borderTopColor: coreColor('#E2E8E7', 'border') },
  railPopupLinkActive: { backgroundColor: ui.colors.primarySoft },
  railPopupLinkText: { color: ui.colors.text, fontFamily: 'Poppins_500Medium', fontSize: 12, flexShrink: 1 },
  railPopupLinkTextActive: { color: ui.colors.primaryText, fontFamily: 'Poppins_700Bold' },
  railFooter: { alignItems: 'center', gap: 2, paddingTop: 5, borderTopWidth: 1, borderTopColor: coreColor('#31545A', 'sidebarSoft') },
  railFooterButton: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
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
    flex: 1,
    minHeight: 0,
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
    borderWidth: 1,
    borderColor: coreColor("#B9E5DE", 'border'),
  },
  desktopNavLabel: {
    color: coreColor("#334155", 'text'),
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    flex: 1,
  },
  desktopNavLabelActive: {
    color: ui.colors.primaryText,
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
    color: ui.colors.primaryText,
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
    backgroundColor: ui.colors.successAction,
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
    backgroundColor: coreColor("#EAF2FF", 'surface'),
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
    backgroundColor: coreColor("#F4F8FF", 'surface'),
    borderColor: coreColor("#CFE0FF", 'border'),
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
    backgroundColor: coreColor("#E5EFFF", 'surface'),
  },
  menuTileLabel: {
    color: coreColor("#40516A", 'text'),
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
    backgroundColor: coreColor("#FBFCFD", 'surface'),
  },
  sheetAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: ui.colors.infoSoft,
    borderWidth: 1,
    borderColor: coreColor("#BFDBFE", 'border'),
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
