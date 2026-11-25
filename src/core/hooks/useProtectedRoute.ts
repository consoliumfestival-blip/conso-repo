import { useEffect } from 'react';
import { useLocalSearchParams, usePathname, useRouter, useSegments } from 'expo-router';
import { useAuthStore } from '../store/authStore';
import { useTenantFeatures } from './useTenantFeatures';

type InstalledPortalMode = 'main' | 'team-management' | 'team-leader';

function getInstalledPortalMode(): InstalledPortalMode | null {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return null;
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (!standalone) return null;

  const windowWithPortal = window as Window & { __installedPortalMode?: InstalledPortalMode };
  const mode = windowWithPortal.__installedPortalMode
    ?? (() => {
      try {
        return window.sessionStorage.getItem('ssf_installed_portal_mode') as InstalledPortalMode | null;
      } catch {
        return null;
      }
    })();
  return mode === 'main' || mode === 'team-management' || mode === 'team-leader' ? mode : null;
}

export function useProtectedRoute() {
  const router = useRouter();
  const segments = useSegments();
  const pathname = usePathname();
  const routeParams = useLocalSearchParams<{ tenant_id?: string }>();
  const { user, role, tenant_id, is_superadmin, initialized, teamSessionStatus } = useAuthStore();
  const routeTenantId = Array.isArray(routeParams.tenant_id) ? routeParams.tenant_id[0] : routeParams.tenant_id;
  const isPublicAuxiliaryPath = segments[0] === 'candidate' || segments[0] === 'unit-profile';
  const isPublicPath = segments[0] === '(public)' || isPublicAuxiliaryPath;
  const publicTenantId = isPublicPath ? (routeTenantId || tenant_id) : null;
  // Only admin and judge routes use private module flags here. Team Leader
  // routes load their parent tenant's flags in their own layout; passing the
  // team's child tenant ID to this RPC causes a legitimate 42501 denial.
  const needsPrivateFeatures = !!user && (segments[0] === '(admin)' || segments[0] === 'judge' || pathname.startsWith('/team-leaders'));
  const { settings: tenantFeatures, isLoading: tenantFeaturesLoading } = useTenantFeatures(needsPrivateFeatures ? tenant_id : null);
  const { settings: publicFeatures, isLoading: publicFeaturesLoading } = useTenantFeatures(publicTenantId, true);
  const installedPortalMode = getInstalledPortalMode();
  const inTeamGroup = segments[0] === 'team';
  const inJudgeRoute = segments[0] === 'judge';
  const isRecoveringTeamSession = inTeamGroup && !user && teamSessionStatus !== 'idle';
  const inTeamLogin = inTeamGroup && pathname === '/team/login';
  const isTeamLeader = role === 'team_leader';
  const isStageVenuePortal = /^\/stage-management\/venue\/[0-9a-f-]{36}$/i.test(pathname);
  const isAnnouncerLink = /^\/announcer\/(?:session\/)?[0-9a-f]{64}\/?$/i.test(pathname);
  const isReadonlyPortal = /^\/festival-view\/[0-9a-f-]{36}\/?$/i.test(pathname);
  const mustBlockCoreRoute = Boolean(initialized && user && isTeamLeader && !inTeamGroup && !isStageVenuePortal && !isReadonlyPortal);
  const isInstalledAdmin = Boolean(user && role === 'admin' && !is_superadmin);
  const mainPortalRouteAllowed = !inTeamGroup
    && pathname !== '/team-leaders'
    && segments[0] !== 'judge'
    && segments[0] !== 'announcer'
    && segments[0] !== '(public)'
    && segments[0] !== '(super)';
  // The Main installed PWA links to these admin-managed portals. Their own
  // role checks below remain authoritative after navigation.
  const mainPwaAdminRouteAllowed = mainPortalRouteAllowed
    || pathname === '/team-leaders'
    || segments[0] === 'judge'
    || isAnnouncerLink;
  const teamManagementRouteAllowed = pathname === '/team-leaders' || segments[0] === '(auth)';
  const mainPortalRouteBlocked = !mainPortalRouteAllowed && segments[0] !== '(auth)' && !isAnnouncerLink;
  const teamLeaderRouteBlocked = !inTeamGroup;
  const mustBlockInstalledPortalRoute = Boolean(initialized && !isReadonlyPortal && (
    (!user && installedPortalMode === 'team-management' && !teamManagementRouteAllowed)
    || (!user && installedPortalMode === 'main' && mainPortalRouteBlocked)
    || (!user && installedPortalMode === 'team-leader' && teamLeaderRouteBlocked)
    || (user && isInstalledAdmin && installedPortalMode === 'team-management' && !teamManagementRouteAllowed)
    || (user && isInstalledAdmin && installedPortalMode === 'main' && !mainPwaAdminRouteAllowed)
    || (user && isTeamLeader && installedPortalMode === 'team-leader' && teamLeaderRouteBlocked)
  ));

  const blockedAdminModule = Boolean(user && role === 'admin' && !is_superadmin && !tenantFeaturesLoading && (
    (pathname.startsWith('/team-leaders') && !tenantFeatures.modules.team_leader_management)
    || (pathname.startsWith('/settings/team-leader-portal') && !tenantFeatures.modules.team_leader_management)
    || (pathname.startsWith('/judges') && !tenantFeatures.modules.judge_portal)
    || (pathname.startsWith('/stage-management') && !isStageVenuePortal && !tenantFeatures.modules.stage_management)
    || (pathname.includes('/smart-announcer') && !tenantFeatures.modules.smart_announcer)
    || (pathname.includes('/settings/leaderboard/poster-studio') && !tenantFeatures.modules.poster_studio)
    || (pathname.includes('/settings/leaderboard/media-center') && !tenantFeatures.modules.media_center)
  ));
  const blockedJudgePortal = Boolean(user && !is_superadmin && (role === 'judge' || role === 'admin') && inJudgeRoute
    && !tenantFeaturesLoading && !tenantFeatures.modules.judge_portal);

  const publicSection = pathname.includes('/leaderboard/schedule') ? 'schedule'
    : pathname.includes('/leaderboard/media') ? 'media'
      : (pathname.includes('/participant-result') || segments[0] === 'candidate') ? 'participant_results'
        : segments[0] === 'unit-profile' ? 'results'
        : pathname.includes('/leaderboard/item-results') || pathname.includes('/leaderboard/individual-rankings')
          || pathname.includes('/leaderboard/unit-rankings') ? 'results' : null;
  const publicBoardRoute = segments[0] === 'unit-profile' || pathname.includes('/leaderboard/unit-rankings') || pathname.includes('/leaderboard/individual-rankings');
  const blockedPublicModule = Boolean(isPublicPath && publicTenantId && pathname !== '/unavailable'
    && !publicFeaturesLoading && (
      !publicFeatures.modules.public_page
      || (publicBoardRoute && !publicFeatures.modules.public_leaderboard)
      || (publicSection === 'schedule' && !publicFeatures.sections.public_page.schedule)
      || (publicSection === 'media' && !publicFeatures.sections.public_page.media)
      || (publicSection === 'participant_results' && (!publicFeatures.sections.public_page.results || !publicFeatures.sections.public_page.participant_results))
      || (publicSection === 'results' && !publicFeatures.sections.public_page.results)
    ));

  useEffect(() => {
    if (!initialized) return;
    if (isRecoveringTeamSession) return;
    if (isReadonlyPortal) return;

    if (blockedAdminModule) {
      router.replace('/(admin)');
      return;
    }
    if (blockedJudgePortal && tenant_id) {
      router.replace({ pathname: '/(public)/unavailable', params: { tenant_id, section: 'Judge Portal' } } as any);
      return;
    }
    if (blockedPublicModule && publicTenantId) {
      const sectionLabel = !publicFeatures.modules.public_page ? 'Public page'
        : publicBoardRoute && !publicFeatures.modules.public_leaderboard ? 'Public leaderboard'
          : publicSection === 'participant_results' ? 'Participant results'
            : publicSection === 'schedule' ? 'Public schedule'
              : publicSection === 'media' ? 'Public media' : 'Public results';
      router.replace({ pathname: '/(public)/unavailable', params: { tenant_id: publicTenantId, section: sectionLabel } } as any);
      return;
    }

    const inAuthGroup = segments[0] === '(auth)';
    const inAdminGroup = segments[0] === '(admin)';
    const inJudgeGroup = segments[0] === 'judge';
    const inSuperGroup = segments[0] === '(super)';
    const inPublicGroup = segments[0] === '(public)';

    if (!user && installedPortalMode === 'team-management' && !teamManagementRouteAllowed) {
      router.replace('/(auth)/login');
      return;
    }
    if (!user && installedPortalMode === 'main' && mainPortalRouteBlocked) {
      router.replace('/(auth)/login');
      return;
    }
    if (!user && installedPortalMode === 'team-leader' && teamLeaderRouteBlocked) {
      router.replace('/team/login');
      return;
    }

    // Installed app entry points are distinct even though the browser routes
    // share one origin and some admin pages share one route group.
    if (user && isInstalledAdmin && installedPortalMode === 'team-management'
      && (inAuthGroup || (segments as string[]).length === 0)) {
      router.replace('/team-leaders');
      return;
    }
    if (user && isInstalledAdmin && installedPortalMode === 'team-management'
      && pathname !== '/team-leaders' && !inAuthGroup) {
      router.replace('/team-leaders');
      return;
    }
    if (user && isInstalledAdmin && installedPortalMode === 'main' && !mainPwaAdminRouteAllowed && !inAuthGroup) {
      router.replace('/(admin)');
      return;
    }
    if (user && isTeamLeader && installedPortalMode === 'team-leader' && !inTeamGroup) {
      router.replace('/team/dashboard');
      return;
    }

    // The Team Leader login is a public entry point. Once authenticated, only
    // a team_leader role may remain inside the /team namespace.
    if (!user && inTeamLogin) return;
    if (user && inTeamGroup && !isTeamLeader) {
      router.replace('/(public)');
      return;
    }

    if (user && pathname.startsWith('/stage-management') && !isStageVenuePortal && role !== 'admin' && !is_superadmin) {
      router.replace('/(public)');
      return;
    }

    // Team Leaders have a dedicated namespace. Keep this check separate from
    // navigation visibility so a manually entered core URL is denied before
    // the protected screen can issue its own queries.
    if (user && isTeamLeader && !inTeamGroup && !isStageVenuePortal) {
      router.replace('/team/dashboard');
      return;
    }

    // --- Unauthenticated ---
    if (!user) {
      if (
        !inPublicGroup && 
        !inAuthGroup && 
        !inTeamLogin &&
        !isStageVenuePortal &&
        !isAnnouncerLink &&
        segments[0] !== 'candidate' && 
        segments[0] !== 'unit-profile' && 
        !inJudgeGroup && 
        segments[0] !== 'notifications'
      ) {
        router.replace('/(auth)/login');
      }
      return;
    }

    // --- Authenticated ---
    // 1. Route from root / auth screens to the correct home
    if (inAuthGroup || (segments as string[]).length === 0) {
      if (is_superadmin) {
        router.replace('/(super)');
      } else if (role === 'admin') {
        router.replace('/(admin)');
      } else if (role === 'judge') {
        router.replace('/judge');
      } else if (role === 'team_leader') {
        router.replace('/team/dashboard');
      } else {
        router.replace('/(public)/leaderboard');
      }
      return;
    }

    // 2. Superadmin strict isolation: block from /(admin) and /(judge)
    if (is_superadmin && (inAdminGroup || inJudgeGroup)) {
      router.replace('/(super)');
      return;
    }

    // 3. Non-superadmins cannot access /(super)
    if (inSuperGroup && !is_superadmin) {
      router.replace('/(public)');
      return;
    }

    // 4. Role-based group enforcement
    if (inAdminGroup && role !== 'admin') {
      router.replace('/(public)');
      return;
    }

    // Judge group: allow judge role AND admin role (admin can preview the portal)
    if (inJudgeGroup && role !== 'judge' && role !== 'admin') {
      router.replace('/(public)');
      return;
    }
  }, [user, role, tenant_id, is_superadmin, initialized, segments, pathname, isStageVenuePortal, isAnnouncerLink, isReadonlyPortal, inTeamGroup, inTeamLogin, isTeamLeader, installedPortalMode, isInstalledAdmin, mainPortalRouteAllowed, mainPortalRouteBlocked, mainPwaAdminRouteAllowed, teamManagementRouteAllowed, teamLeaderRouteBlocked, isRecoveringTeamSession, blockedAdminModule, blockedJudgePortal, blockedPublicModule, publicTenantId, publicFeatures.modules.public_page, publicFeatures.modules.public_leaderboard, publicSection, publicBoardRoute, publicFeatures.sections.public_page, router]);

  return mustBlockCoreRoute || mustBlockInstalledPortalRoute || isRecoveringTeamSession;
}
