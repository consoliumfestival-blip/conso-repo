import { useEffect } from 'react';
import { usePathname, useRouter, useSegments } from 'expo-router';
import { useAuthStore } from '../store/authStore';

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
  const { user, role, is_superadmin, initialized } = useAuthStore();
  const installedPortalMode = getInstalledPortalMode();
  const inTeamGroup = segments[0] === 'team';
  const inTeamLogin = inTeamGroup && pathname === '/team/login';
  const isTeamLeader = role === 'team_leader';
  const isStageVenuePortal = /^\/stage-management\/venue\/[0-9a-f-]{36}$/i.test(pathname);
  const mustBlockCoreRoute = Boolean(initialized && user && isTeamLeader && !inTeamGroup && !isStageVenuePortal);
  const isInstalledAdmin = Boolean(user && role === 'admin' && !is_superadmin);
  const mainPortalRouteAllowed = !inTeamGroup
    && pathname !== '/team-leaders'
    && segments[0] !== 'judge'
    && segments[0] !== 'announcer'
    && segments[0] !== '(public)'
    && segments[0] !== '(super)';
  const teamManagementRouteAllowed = pathname === '/team-leaders' || segments[0] === '(auth)';
  const mainPortalRouteBlocked = !mainPortalRouteAllowed && segments[0] !== '(auth)';
  const teamLeaderRouteBlocked = !inTeamGroup;
  const mustBlockInstalledPortalRoute = Boolean(initialized && (
    (!user && installedPortalMode === 'team-management' && !teamManagementRouteAllowed)
    || (!user && installedPortalMode === 'main' && mainPortalRouteBlocked)
    || (!user && installedPortalMode === 'team-leader' && teamLeaderRouteBlocked)
    || (user && isInstalledAdmin && installedPortalMode === 'team-management' && !teamManagementRouteAllowed)
    || (user && isInstalledAdmin && installedPortalMode === 'main' && mainPortalRouteBlocked)
    || (user && isTeamLeader && installedPortalMode === 'team-leader' && teamLeaderRouteBlocked)
  ));

  useEffect(() => {
    if (!initialized) return;

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
    if (user && isInstalledAdmin && installedPortalMode === 'main' && !mainPortalRouteAllowed && !inAuthGroup) {
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
  }, [user, role, is_superadmin, initialized, segments, pathname, isStageVenuePortal, inTeamGroup, inTeamLogin, isTeamLeader, installedPortalMode, isInstalledAdmin, mainPortalRouteAllowed, mainPortalRouteBlocked, teamManagementRouteAllowed, teamLeaderRouteBlocked, router]);

  return mustBlockCoreRoute || mustBlockInstalledPortalRoute;
}
