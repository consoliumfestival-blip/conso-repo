import { CORE_PALETTES, coreColor } from '@/constants/coreTheme';
import { Modal } from '@/components/ui/CoreModal';
import React, { useMemo, useState } from "react";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import {
  BadgePlus,
  BarChart3,
  SlidersHorizontal,
  ClipboardList,
  Medal,
  Image,
  Images,
  UserRoundCog,
  Mic,
  Eye,
  Calendar,
  ListChecks,
  Calculator,
  KeyRound,
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
  PanelLeftClose,
  PanelLeftOpen,
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
import { adminNavigationMode, isAdminTablet, splitMenuSections } from "@/core/utils/adminNavigationLayout";
import { useTenantFeatures } from "@/core/hooks/useTenantFeatures";
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
  onBottomNavigation,
}: {
  pathname: string;
  items: NavItem[];
  layout?: 'tablet' | 'desktop';
  onBottomNavigation?: () => void;
}) {
  const router = useRouter();
  const { logout, user } = useAuthStore();
  const appearance = useCoreAppearance();
  const sidebarAppearance = useSidebarAppearance();
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [tabletExpanded, setTabletExpanded] = useState(false);
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
  const tablet = layout === 'tablet';
  const iconColor = !tablet && sidebarAppearance === 'dark' ? coreColor('#D7E8E8', 'sidebarText') : CORE_PALETTES[appearance?.appearance.palette || 'teal'].primary;

  return (
    <View
      className="no-print"
      {...(tablet ? { onMouseEnter: () => setTabletExpanded(true), onMouseLeave: () => setTabletExpanded(false) } : { onMouseEnter: cancelClose, onMouseLeave: scheduleClose }) as any}
      style={[tablet ? styles.tabletSidebar : styles.sidebar, tablet && !tabletExpanded && styles.tabletSidebarCompact, !tablet && sidebarAppearance === 'light' && styles.sidebarLight]}
    >
      {tablet ? <Pressable accessibilityRole="button" accessibilityLabel="Consolium dashboard" onPress={() => go('/(admin)')} style={[styles.tabletBrand, !tabletExpanded && styles.tabletBrandCompact]}><ConsoliumLogo size={32} borderRadius={10} />{tabletExpanded && <Text numberOfLines={1} style={styles.tabletBrandText}>Consolium</Text>}</Pressable> : <Pressable accessibilityRole="button" accessibilityLabel="Consolium dashboard" onPress={() => go('/(admin)')} style={styles.railLogo}><ConsoliumLogo size={32} borderRadius={10} /></Pressable>}
      <View style={{ flex: 1, minHeight: 0 }}>
        <ScrollView
          style={styles.sidebarScroll}
          contentContainerStyle={tablet ? { paddingHorizontal: tabletExpanded ? 8 : 2, paddingBottom: 4 } : { alignItems: 'center', paddingBottom: 4 }}
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
                    {tabletExpanded && <Text numberOfLines={1} style={[styles.tabletNavLabel, active && styles.tabletNavLabelActive]}>{item.shortLabel || item.label}</Text>}
                    {item.label === 'Judge Management' && pendingCount > 0 && <Text style={styles.tabletBadge}>{pendingCount}</Text>}
                  </Pressable>
                  {tabletExpanded && !!item.children?.length && <Pressable accessibilityRole="button" accessibilityLabel={`${expanded ? 'Hide' : 'Show'} ${item.label} pages`} accessibilityState={{ expanded }} onPress={() => setOpenGroups(current => ({ ...current, [item.label]: !expanded }))} style={styles.tabletDisclosure}>{expanded ? <ChevronDown size={14} color={ui.colors.textMuted} /> : <ChevronRight size={14} color={ui.colors.textMuted} />}</Pressable>}
                </View>
                {tabletExpanded && !!item.children?.length && expanded && <View style={styles.tabletSubmenu}>{item.children.map(child => <Pressable key={child.label} {...{ dataSet: { tabletSubmenuLink: "true" } } as any} accessibilityRole="button" accessibilityState={{ selected: child.match(pathname) }} onPress={() => go(child.path)} style={[styles.tabletSubmenuLink, child.match(pathname) && styles.tabletSubmenuLinkActive]}><Text numberOfLines={1} style={[styles.tabletSubmenuText, child.match(pathname) && styles.tabletSubmenuTextActive]}>{child.label}</Text></Pressable>)}</View>}
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
      <View style={[styles.railFooter, tablet && styles.tabletFooter, tablet && !tabletExpanded && styles.tabletFooterCompact]}>
        {tablet && <Pressable accessibilityRole="button" accessibilityLabel={tabletExpanded ? "Collapse sidebar" : "Expand sidebar"} accessibilityState={{ expanded: tabletExpanded }} onPress={() => setTabletExpanded(value => !value)} style={styles.railFooterButton}>{tabletExpanded ? <PanelLeftClose size={17} color={iconColor} /> : <PanelLeftOpen size={17} color={iconColor} />}</Pressable>}
        {onBottomNavigation && <Pressable accessibilityRole="button" accessibilityLabel="Switch to bottom navigation" onPress={onBottomNavigation} style={styles.railFooterButton}><Menu size={17} color={iconColor} /></Pressable>}
        <Pressable accessibilityRole="button" accessibilityLabel="Appearance settings" onPress={() => go('/(admin)/settings/appearance')} style={styles.railFooterButton}><Palette size={17} color={iconColor} /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={appearance?.isDark ? 'Use light mode' : 'Use dark mode'} onPress={() => appearance?.setAppearance({ ...appearance.appearance, mode: appearance.isDark ? 'light' : 'dark' })} style={styles.railFooterButton}>{appearance?.isDark ? <Sun size={17} color={iconColor} /> : <Moon size={17} color={iconColor} />}</Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Sign out" onPress={() => setLogoutConfirmOpen(true)} style={styles.railFooterButton}><LogOut size={17} color={iconColor} /></Pressable>
        {user && <View accessibilityLabel="Signed in" accessible style={styles.accountStatus}><View style={styles.accountStatusDot} /></View>}
      </View>
      <Modal
        visible={logoutConfirmOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setLogoutConfirmOpen(false)}
      >
        <View style={styles.confirmationRoot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel sign out"
            onPress={() => setLogoutConfirmOpen(false)}
            style={styles.confirmationScrim}
          />
          <View
            accessibilityViewIsModal
            accessibilityLabel="Confirm sign out"
            style={styles.confirmationCard}
          >
            <Text style={styles.confirmationTitle}>Sign out?</Text>
            <Text style={styles.confirmationMessage}>
              Are you sure you want to sign out of this account?
            </Text>
            <View style={styles.confirmationActions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setLogoutConfirmOpen(false)}
                style={[styles.confirmationButton, styles.confirmationCancelButton]}
              >
                <Text style={styles.confirmationCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setLogoutConfirmOpen(false);
                  void logout();
                }}
                style={[styles.confirmationButton, styles.confirmationSignOutButton]}
              >
                <Text style={styles.confirmationSignOutText}>Sign out</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function MobileMenuSheet(props: { visible: boolean; onClose: () => void; pathname: string; items: NavItem[]; onSidebar: () => void }) {
  const { width } = useWindowDimensions();
  return isAdminTablet(width) ? <TabletMenuSheet {...props} /> : <PhoneMenuSheet {...props} />;
}

function TabletMenuSheet({ visible, onClose, pathname, items, onSidebar }: {
  visible: boolean; onClose: () => void; pathname: string; items: NavItem[]; onSidebar: () => void;
}) {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const { pendingCount } = useJudgeApprovalStore();
  const [position, setPosition] = useState<'left' | 'center' | 'right'>(() => {
    if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return 'left';
    try { const saved = localStorage.getItem('admin-tablet-menu-position-v1'); return saved === 'center' || saved === 'right' ? saved : 'left'; } catch { return 'left'; }
  });
  const positionChanged = React.useRef(false);
  React.useEffect(() => {
    if (Platform.OS === 'web') return;
    let active = true;
    void AsyncStorage.getItem('admin-tablet-menu-position-v1').then(value => {
      if (active && !positionChanged.current && (value === 'left' || value === 'center' || value === 'right')) setPosition(value);
    }).catch(() => {});
    return () => { active = false; };
  }, []);
  const choosePosition = (value: 'left' | 'center' | 'right') => {
    positionChanged.current = true; setPosition(value);
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      try { localStorage.setItem('admin-tablet-menu-position-v1', value); } catch { /* Keep the current session preference. */ }
    } else if (Platform.OS !== 'web') void AsyncStorage.setItem('admin-tablet-menu-position-v1', value).catch(() => {});
  };
  const iconByLabel: Record<string, IconType> = {
    'Team Leader Management': UserRoundCog, 'Smart Announcer': Mic, 'Festival Viewer': Eye,
    'Unit Rankings': BarChart3, 'Leaderboard Controls': SlidersHorizontal,
    'Item Results': ClipboardList, 'Individual Rankings': Medal, 'Poster Studio': Image,
    'Media Center': Images, 'Festival Calendar': Calendar, 'Item Activation': ListChecks,
    'Points & Grading': Calculator, 'Scoring Rules': Scale, 'Appearance': Palette,
    'AI Settings & API Keys': KeyRound,
  };
  const entries = items.flatMap(item => item.children?.length
    ? item.children.map(child => ({ ...child, icon: iconByLabel[child.label] || item.icon, badge: false }))
    : [{ label: item.label, path: item.path, match: item.match, icon: item.icon, badge: item.label === 'Judge Management' }]);
  const windowSize = Math.max(0, Math.min(620, width - 24, height - 24));
  const columns = Math.max(1, Math.min(7, Math.floor((windowSize - 28 + 8) / 72)));
  const tileWidth = Math.max(44, Math.floor((windowSize - 28 - (columns - 1) * 8) / columns));
  const navigate = (path: string) => { onClose(); setTimeout(() => router.push(path as any), 150); };
  return <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
    <View style={[styles.modalRoot, { alignItems: position === 'left' ? 'flex-start' : position === 'right' ? 'flex-end' : 'center', padding: 12 }]}>
      <Pressable {...{ dataSet: { tabletMenuScrim: "true" } } as any} style={styles.tabletMenuScrim} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close menu" />
      <SafeAreaView {...{ dataSet: { coreGlass: 'sheet' } } as any} style={[styles.sheet, styles.tabletFloatingSheet, { width: windowSize, height: Math.min(Math.round(windowSize * 0.60), height - 24), maxHeight: height - 24 }]}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Menu</Text>
          <View style={styles.positionControls}>{(['left', 'center', 'right'] as const).map(value => <Pressable key={value} accessibilityRole="button" accessibilityLabel={`Place menu ${value}`} accessibilityState={{ selected: position === value }} onPress={() => choosePosition(value)} style={[styles.positionButton, position === value && styles.positionButtonActive]}><Text style={[styles.positionButtonText, position === value && styles.menuEntryTextActive]}>{value === 'left' ? 'L' : value === 'right' ? 'R' : 'C'}</Text></Pressable>)}</View>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close menu" onPress={onClose} style={styles.sheetClose}><X size={20} color={ui.colors.textMuted} /></TouchableOpacity>
        </View>
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.menuSections}>
          <View style={styles.menuEntries}>
            {entries.map(entry => {
              const active = entry.match(pathname);
              const Icon = entry.icon;
              return <TouchableOpacity key={entry.path} accessibilityRole="button" accessibilityLabel={entry.label} accessibilityState={{ selected: active }} onPress={() => navigate(entry.path)} style={[styles.menuEntry, { width: tileWidth, minHeight: 56 }, active && styles.menuEntryActive]}>
                <Icon size={16} color={active ? ui.colors.primaryText : ui.colors.textMuted} />
                <Text style={[styles.menuEntryText, active && styles.menuEntryTextActive]} numberOfLines={3}>{entry.label}</Text>
                {entry.badge && pendingCount > 0 && <Text style={styles.tabletBadge}>{pendingCount}</Text>}
              </TouchableOpacity>;
            })}
          </View>
        </ScrollView>
        <View style={styles.menuFooter}><TouchableOpacity accessibilityRole="button" accessibilityLabel="Switch to sidebar navigation" onPress={() => { onClose(); onSidebar(); }} style={styles.navigationToggle}><PanelsTopLeft size={16} color={ui.colors.primaryText} /><Text style={styles.navigationToggleText}>Switch to sidebar</Text></TouchableOpacity></View>
      </SafeAreaView>
    </View>
  </Modal>;
}

function PhoneMenuSheet({ visible, onClose, pathname, items, onSidebar }: {
  visible: boolean; onClose: () => void; pathname: string; items: NavItem[]; onSidebar: () => void;
}) {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const { pendingCount } = useJudgeApprovalStore();
  const tablet = isAdminTablet(width);
  const panelWidth = tablet ? Math.max(0, (width - 28 - 17) / 2) : width - 28;
  const columns = tablet ? Math.max(1, Math.min(5, Math.floor((panelWidth + 8) / 78))) : width >= 700 ? 5 : width >= 440 ? 4 : 3;
  const tileSize = Math.min(100, Math.max(tablet ? 44 : 70, Math.floor((panelWidth - (columns - 1) * 8) / columns)));
  const sections: { key: string; title?: string; entries: { label: string; path: string; match: NavItem['match']; icon: IconType; badge?: boolean }[] }[] = [];
  for (const item of items) {
    if (item.children?.length) {
      sections.push({ key: item.label, title: item.label, entries: item.children.map(child => ({ ...child, icon: item.icon })) });
    } else {
      const last = sections[sections.length - 1];
      const group = last && !last.title ? last : { key: item.label, entries: [] };
      if (group !== last) sections.push(group);
      group.entries.push({ label: item.label, path: item.path, match: item.match, icon: item.icon, badge: item.label === 'Judge Management' });
    }
  }
  const groups = tablet ? splitMenuSections(sections, columns) : [sections];
  const navigate = (path: string) => { onClose(); setTimeout(() => router.push(path as any), 150); };
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={styles.modalRoot}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close menu" />
      <SafeAreaView {...{ dataSet: { coreGlass: 'sheet' } } as any} style={[styles.sheet, { height: height * 0.8 }]}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Menu</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close menu" onPress={onClose} style={styles.sheetClose}><X size={20} color={ui.colors.textMuted} /></TouchableOpacity>
        </View>
        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.menuSections}>
          <View style={tablet ? styles.tabletMenuColumns : undefined}>
          {groups.map((group, index) => <View key={index} style={tablet ? [styles.tabletMenuColumn, index === 1 && styles.tabletMenuDivider] : undefined}>
          {group.map(section => <View key={section.key} style={styles.menuSection}>
            {section.title && <Text style={styles.menuSectionTitle}>{section.title}</Text>}
            <View style={styles.menuEntries}>
              {section.entries.map(entry => {
                const active = entry.match(pathname);
                const Icon = entry.icon;
                return <TouchableOpacity key={entry.path} accessibilityRole="button" accessibilityLabel={entry.label} accessibilityState={{ selected: active }} onPress={() => navigate(entry.path)} style={[styles.menuEntry, { width: tileSize, height: tileSize }, active && styles.menuEntryActive]}>
                  <Icon size={19} color={active ? ui.colors.primaryText : ui.colors.textMuted} />
                  <Text style={[styles.menuEntryText, active && styles.menuEntryTextActive]} numberOfLines={3}>{entry.label}</Text>
                  {entry.badge && pendingCount > 0 && <Text style={styles.tabletBadge}>{pendingCount}</Text>}
                </TouchableOpacity>;
              })}
            </View>
          </View>)}
          </View>)}
          </View>
        </ScrollView>
        <View style={styles.menuFooter}><TouchableOpacity accessibilityRole="button" accessibilityLabel="Switch to sidebar navigation" onPress={() => { onClose(); onSidebar(); }} style={styles.navigationToggle}><PanelsTopLeft size={16} color={ui.colors.primaryText} /><Text style={styles.navigationToggleText}>Switch to sidebar</Text></TouchableOpacity></View>
      </SafeAreaView>
    </View>
  </Modal>;
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
  const primaryItems = items.slice(0, 4);

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

function TabletFloatingBar({
  pathname,
  items,
  width,
  height,
  onMenu,
}: {
  pathname: string;
  items: NavItem[];
  width: number;
  height: number;
  onMenu: () => void;
}) {
  const router = useRouter();
  const isLandscape = width > height;
  const directItem = (label: string, shortLabel: string) => {
    const item = items.find((candidate) => candidate.label === label);
    return item ? { ...item, shortLabel } : null;
  };
  const childItem = (
    parentLabel: string,
    childLabel: string,
    shortLabel: string,
    icon: IconType,
  ): NavItem | null => {
    const child = items
      .find((candidate) => candidate.label === parentLabel)
      ?.children?.find((candidate) => candidate.label === childLabel);
    return child ? { ...child, shortLabel, icon } : null;
  };
  const results = childItem("Leaderboard Management", "Item Results", "Results", ClipboardList);
  const teamStanding = childItem("Leaderboard Management", "Unit Rankings", "Team Standing", BarChart3);
  const reports = directItem("Reports & printouts", "Reports");
  const quickItems: (NavItem | null)[] = isLandscape
    ? [
        directItem("Dashboard", "Home"),
        directItem("Participants", "Participants"),
        directItem("Programs", "Programs"),
        directItem("Schedules", "Schedule"),
        directItem("Stage Management", "Stage"),
        reports,
        results,
        teamStanding,
      ]
    : [
        directItem("Dashboard", "Home"),
        directItem("Participants", "Participants"),
        directItem("Programs", "Programs"),
        directItem("Schedules", "Schedule"),
        results,
        teamStanding,
        reports,
      ];

  const visibleItems = quickItems.filter((item): item is NavItem => item !== null);

  return (
    <SafeAreaView
      pointerEvents="box-none"
      className="no-print"
      style={styles.tabletFloatingBarSafe}
    >
      <View style={styles.tabletFloatingBar}>
        <View style={styles.tabletQuickLinks}>
          {visibleItems.map((item) => {
            const active = item.match(pathname);
            const Icon = item.icon;
            return (
              <TouchableOpacity
                key={item.label}
                accessibilityRole="button"
                accessibilityLabel={item.label}
                accessibilityState={{ selected: active }}
                onPress={() => router.push(item.path as any)}
                style={styles.tabletQuickLink}
              >
                <View style={[styles.tabletQuickIcon, active && styles.tabletQuickIconActive]}>
                  <Icon
                    size={18}
                    color={active ? ui.colors.primaryText : ui.colors.textMuted}
                    strokeWidth={active ? 2.3 : 2}
                  />
                </View>
                <Text
                  numberOfLines={1}
                  style={[styles.tabletQuickLabel, active && styles.tabletQuickLabelActive]}
                >
                  {item.shortLabel || item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Open navigation menu"
            onPress={onMenu}
            style={styles.tabletQuickLink}
          >
            <View style={styles.tabletQuickIcon}>
              <Menu size={18} color={ui.colors.textMuted} strokeWidth={2} />
            </View>
            <Text numberOfLines={1} style={styles.tabletQuickLabel}>More</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

export function AdminAppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const tenantId = useAuthStore((state) => state.tenant_id);
  const { settings: tenantFeatures } = useTenantFeatures(tenantId);
  const { width, height } = useWindowDimensions();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigationMode = adminNavigationMode(width);
  const [mobilePreference, setMobilePreference] = useState<'bottom' | 'sidebar'>(() => {
    if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return 'bottom';
    try { return localStorage.getItem('admin-navigation-mode-v1') === 'sidebar' ? 'sidebar' : 'bottom'; } catch { return 'bottom'; }
  });
  const preferenceChanged = React.useRef(false);
  React.useEffect(() => {
    if (Platform.OS === 'web') return;
    let active = true;
    void AsyncStorage.getItem('admin-navigation-mode-v1').then(value => {
      if (active && !preferenceChanged.current && (value === 'sidebar' || value === 'bottom')) setMobilePreference(value);
    }).catch(() => {});
    return () => { active = false; };
  }, []);
  const setMobileNavigation = (value: 'bottom' | 'sidebar') => {
    preferenceChanged.current = true;
    setMobilePreference(value);
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      try { localStorage.setItem('admin-navigation-mode-v1', value); } catch { /* Keep the session preference. */ }
    } else if (Platform.OS !== 'web') {
      void AsyncStorage.setItem('admin-navigation-mode-v1', value).catch(() => {});
    }
  };
  const showSidebar = navigationMode === 'desktop' || mobilePreference === 'sidebar';
  const visibleNavItems = useMemo(() => getTenantNavigation(tenantFeatures), [tenantFeatures]);

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
          layout={navigationMode === 'desktop' ? 'desktop' : 'tablet'}
          onBottomNavigation={navigationMode === 'desktop' ? undefined : () => setMobileNavigation('bottom')}
        />
      )}
      <View style={styles.shellMain}>
        <View style={[styles.content, !showSidebar && (navigationMode === 'tablet' ? styles.tabletContent : styles.mobileContent)]}>
          {(pathname === "/" || pathname === "/(admin)" || pathname === "/admin") && <PortalInstallPrompt portal="main" />}
          {pathname === "/team-leaders" && <PortalInstallPrompt portal="team-management" />}
          {children}
        </View>
      </View>

      {!showSidebar && (
        <>
          {navigationMode === 'tablet' ? (
            <TabletFloatingBar
              pathname={pathname}
              items={visibleNavItems}
              width={width}
              height={height}
              onMenu={() => setMenuOpen(true)}
            />
          ) : (
            <MobileBottomBar
              pathname={pathname}
              onMenu={() => setMenuOpen(true)}
              items={visibleNavItems}
            />
          )}
          <MobileMenuSheet
            visible={menuOpen}
            pathname={pathname}
            onClose={() => setMenuOpen(false)}
            items={visibleNavItems}
            onSidebar={() => setMobileNavigation('sidebar')}
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
  tabletContent: {
    paddingBottom: 104,
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
  tabletSidebarCompact: { width: 52, paddingVertical: 10 },
  tabletBrandCompact: { paddingHorizontal: 0, justifyContent: 'center' },
  tabletFooterCompact: { flexDirection: 'column', paddingHorizontal: 0 },
  tabletBrand: { height: 46, paddingHorizontal: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 9 },
  tabletBrandText: { flex: 1, color: ui.colors.text, fontFamily: "Outfit_700Bold", fontSize: 13 },
  tabletNavGroup: { marginBottom: 3 },
  tabletNavRow: { minHeight: 38, borderRadius: 9, flexDirection: 'row', alignItems: 'center' },
  tabletNavRowActive: { backgroundColor: ui.colors.primarySoft },
  tabletNavMain: { flex: 1, minWidth: 0, minHeight: 38, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 9 },
  tabletNavLabel: { flex: 1, color: ui.colors.textMuted, fontFamily: "Outfit_500Medium", fontSize: 10 },
  tabletNavLabelActive: { color: ui.colors.primaryText, fontFamily: "Outfit_700Bold" },
  tabletBadge: { color: ui.colors.onPrimary, backgroundColor: ui.colors.dangerAction, overflow: 'hidden', borderRadius: 8, paddingHorizontal: 5, fontSize: 9 },
  tabletDisclosure: { width: 34, height: 38, alignItems: 'center', justifyContent: 'center' },
  tabletSubmenu: { marginLeft: 18, paddingLeft: 8, borderLeftWidth: 1, borderLeftColor: ui.colors.border, marginBottom: 4 },
  tabletSubmenuLink: { minHeight: 30, paddingHorizontal: 8, justifyContent: 'center', borderRadius: 7 },
  tabletSubmenuLinkActive: { backgroundColor: ui.colors.surfaceMuted },
  tabletSubmenuText: { color: ui.colors.textMuted, fontFamily: "Outfit_400Regular", fontSize: 9 },
  tabletSubmenuTextActive: { color: ui.colors.primaryText, fontFamily: "Outfit_700Bold" },
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
  railTooltipTitle: { fontFamily: "Outfit_500Medium", fontSize: 10, paddingHorizontal: 0, paddingVertical: 0 },
  railPopupTitle: { color: ui.colors.text, fontFamily: "Outfit_700Bold", fontSize: 13, paddingHorizontal: 8, paddingVertical: 7 },
  railPopupLink: { minHeight: 42, borderRadius: 9, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  railPopupLinkDivider: { borderTopWidth: 1, borderTopColor: coreColor('#E2E8E7', 'border') },
  railPopupLinkActive: { backgroundColor: ui.colors.primarySoft },
  railPopupLinkText: { color: ui.colors.text, fontFamily: "Outfit_500Medium", fontSize: 12, flexShrink: 1 },
  railPopupLinkTextActive: { color: ui.colors.primaryText, fontFamily: "Outfit_700Bold" },
  railFooter: { alignItems: 'center', gap: 2, paddingTop: 5, borderTopWidth: 1, borderTopColor: coreColor('#31545A', 'sidebarSoft') },
  tabletFooter: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', paddingHorizontal: 4, borderTopWidth: 0 },
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
    fontFamily: "Outfit_700Bold",
    fontSize: 16,
    lineHeight: 20,
  },
  brandCaption: {
    color: ui.colors.textMuted,
    fontFamily: "Outfit_400Regular",
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
    fontFamily: "Outfit_700Bold",
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
    fontFamily: "Outfit_400Regular",
    fontSize: 12,
    flex: 1,
  },
  desktopNavLabelActive: {
    color: ui.colors.primaryText,
    fontFamily: "Outfit_700Bold",
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
    fontFamily: "Outfit_400Regular",
    fontSize: 11,
  },
  desktopSubmenuLabelActive: {
    color: ui.colors.text,
    fontFamily: "Outfit_700Bold",
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
    fontFamily: "Outfit_700Bold",
    fontSize: 11,
  },
  profileRole: {
    color: ui.colors.textMuted,
    fontFamily: "Outfit_400Regular",
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
  accountStatus: { height: 18, alignItems: "center", justifyContent: "center" },
  accountStatusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: ui.colors.successAction },
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
  tabletFloatingBarSafe: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 40,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 8,
  },
  tabletFloatingBar: {
    width: "96%",
    maxWidth: 1080,
    minHeight: 68,
    paddingHorizontal: 8,
    justifyContent: "center",
    backgroundColor: coreColor("#FFFFFF", "surface"),
    borderWidth: 1,
    borderColor: coreColor("#D9E4E2", "border"),
    borderRadius: 18,
  },
  tabletQuickLinks: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  tabletQuickLink: {
    flex: 1,
    minWidth: 0,
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    paddingHorizontal: 3,
  },
  tabletQuickIcon: {
    width: 34,
    height: 30,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  tabletQuickIconActive: {
    backgroundColor: ui.colors.primarySoft,
  },
  tabletQuickLabel: {
    maxWidth: "100%",
    marginTop: 2,
    color: ui.colors.textMuted,
    fontFamily: "Outfit_600SemiBold",
    fontSize: 10,
  },
  tabletQuickLabelActive: {
    color: ui.colors.primaryText,
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
    fontFamily: "Outfit_700Bold",
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
  confirmationRoot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  confirmationScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.42)",
  },
  confirmationCard: {
    width: "100%",
    maxWidth: 380,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: ui.colors.border,
    backgroundColor: ui.colors.surface,
    ...ui.shadow,
  },
  confirmationTitle: {
    color: ui.colors.text,
    fontFamily: "Outfit_700Bold",
    fontSize: 18,
  },
  confirmationMessage: {
    marginTop: 6,
    color: ui.colors.textMuted,
    fontFamily: "Outfit_400Regular",
    fontSize: 14,
    lineHeight: 20,
  },
  confirmationActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 20,
  },
  confirmationButton: {
    minHeight: 40,
    minWidth: 88,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    borderRadius: 9,
  },
  confirmationCancelButton: {
    borderWidth: 1,
    borderColor: ui.colors.border,
    backgroundColor: ui.colors.surface,
  },
  confirmationCancelText: {
    color: ui.colors.text,
    fontFamily: "Outfit_600SemiBold",
    fontSize: 13,
  },
  confirmationSignOutButton: {
    backgroundColor: ui.colors.destructive,
  },
  confirmationSignOutText: {
    color: ui.colors.onPrimary,
    fontFamily: "Outfit_700Bold",
    fontSize: 13,
  },
  sheet: {
    width: "100%",
    maxHeight: "88%",
    backgroundColor: ui.colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: "hidden",
  },
  tabletMenuScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "transparent" },
  tabletFloatingSheet: { borderRadius: 20, ...ui.shadow },
  positionControls: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto', marginRight: 8 },
  positionButton: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  positionButtonActive: { backgroundColor: ui.colors.primarySoft },
  positionButtonText: { color: ui.colors.textMuted, fontFamily: 'Outfit_700Bold', fontSize: 12 },
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
    fontFamily: "Outfit_700Bold",
    fontSize: 20,
  },
  sheetSubtitle: {
    color: ui.colors.textMuted,
    fontFamily: "Outfit_400Regular",
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
  tabletMenuColumns: { flexDirection: "row", alignItems: "flex-start" },
  tabletMenuColumn: { flex: 1, minWidth: 0 },
  tabletMenuDivider: { borderLeftWidth: 1, borderLeftColor: ui.colors.border, marginLeft: 8, paddingLeft: 8 },
  menuSections: { paddingHorizontal: 14, paddingVertical: 10, paddingBottom: 20 },
  menuSection: { marginBottom: 10 },
  menuSectionTitle: { color: ui.colors.textMuted, fontFamily: "Outfit_700Bold", fontSize: 12, marginBottom: 5, paddingHorizontal: 4 },
  menuEntries: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  menuEntry: { minHeight: 72, alignItems: "center", justifyContent: "center", padding: 5, borderRadius: 10, backgroundColor: ui.colors.surface, gap: 5 },
  menuEntryActive: { backgroundColor: ui.colors.primarySoft },
  menuEntryText: { color: ui.colors.text, fontFamily: "Outfit_500Medium", fontSize: 11, textAlign: "center" },
  menuEntryTextActive: { color: ui.colors.primaryText, fontFamily: "Outfit_700Bold" },
  menuFooter: { paddingHorizontal: 16, paddingVertical: 8, borderTopWidth: 1, borderTopColor: ui.colors.border },
  navigationToggle: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 9, borderWidth: 1, borderColor: ui.colors.border },
  navigationToggleText: { color: ui.colors.primaryText, fontFamily: "Outfit_700Bold", fontSize: 12 },
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
    fontFamily: "Outfit_700Bold",
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
    fontFamily: "Outfit_700Bold",
    fontSize: 17,
  },
  sheetProfileName: {
    color: ui.colors.text,
    fontFamily: "Outfit_700Bold",
    fontSize: 13,
  },
  sheetProfileRole: {
    color: ui.colors.textMuted,
    fontFamily: "Outfit_400Regular",
    fontSize: 10,
    textTransform: "capitalize",
  },
});
