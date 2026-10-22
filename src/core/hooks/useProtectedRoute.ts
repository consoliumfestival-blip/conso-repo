import { useEffect } from 'react';
import { usePathname, useRouter, useSegments } from 'expo-router';
import { useAuthStore } from '../store/authStore';

export function useProtectedRoute() {
  const router = useRouter();
  const segments = useSegments();
  const pathname = usePathname();
  const { user, role, is_superadmin, initialized } = useAuthStore();
  const inTeamGroup = segments[0] === 'team';
  const inTeamLogin = inTeamGroup && segments[1] === 'login';
  const isTeamLeader = role === 'team_leader';
  const isStageVenuePortal = /^\/stage-management\/venue\/[0-9a-f-]{36}$/i.test(pathname);
  const mustBlockCoreRoute = Boolean(initialized && user && isTeamLeader && !inTeamGroup && !isStageVenuePortal);

  useEffect(() => {
    if (!initialized) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inAdminGroup = segments[0] === '(admin)';
    const inJudgeGroup = segments[0] === 'judge';
    const inSuperGroup = segments[0] === '(super)';
    const inPublicGroup = segments[0] === '(public)';

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
  }, [user, role, is_superadmin, initialized, segments, pathname, isStageVenuePortal, inTeamGroup, inTeamLogin, isTeamLeader, router]);

  return mustBlockCoreRoute;
}
