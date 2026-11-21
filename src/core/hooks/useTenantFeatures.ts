import { useQuery } from '@tanstack/react-query';
import { supabase } from '../config/supabase';
import { Platform } from 'react-native';
import { usePublicSnapshot } from './usePublicSnapshot';
import { useFreshPublicQuery } from './useFreshPublicQuery';

export type TenantModuleKey =
  | 'team_leader_management'
  | 'team_leader_portal'
  | 'smart_announcer'
  | 'stage_management'
  | 'judge_portal'
  | 'direct_entry'
  | 'public_page'
  | 'public_leaderboard'
  | 'poster_studio'
  | 'media_center';

export type TenantModules = Record<TenantModuleKey, boolean>;
export type TeamPortalSection = 'my_team' | 'schedule' | 'results' | 'participants' | 'programs' | 'announcements';
export type PublicPageSection = 'schedule' | 'results' | 'participant_results' | 'media';

export type TenantFeatureSettings = {
  tenant_id?: string;
  revision?: number;
  modules: TenantModules;
  sections: {
    team_leader_portal: Record<TeamPortalSection, boolean>;
    public_page: Record<PublicPageSection, boolean>;
  };
};

export const DEFAULT_TENANT_FEATURE_SETTINGS: TenantFeatureSettings = {
  modules: {
    team_leader_management: true,
    team_leader_portal: true,
    smart_announcer: true,
    stage_management: true,
    judge_portal: true,
    direct_entry: true,
    public_page: true,
    public_leaderboard: true,
    poster_studio: true,
    media_center: true,
  },
  sections: {
    team_leader_portal: { my_team: true, schedule: true, results: true, participants: true, programs: true, announcements: true },
    public_page: { schedule: true, results: true, participant_results: true, media: true },
  },
};

function normalizeSettings(raw: any, publicOnly = false): TenantFeatureSettings {
  if (publicOnly) {
    const flags = raw ?? {};
    return {
      ...DEFAULT_TENANT_FEATURE_SETTINGS,
      modules: {
        ...DEFAULT_TENANT_FEATURE_SETTINGS.modules,
        public_page: flags.public_page !== false,
        public_leaderboard: flags.public_leaderboard !== false,
      },
      sections: {
        ...DEFAULT_TENANT_FEATURE_SETTINGS.sections,
        public_page: {
          schedule: flags.sections?.schedule !== false,
          results: flags.sections?.results !== false,
          participant_results: flags.sections?.participant_results !== false,
          media: flags.sections?.media !== false,
        },
      },
    };
  }

  return {
    tenant_id: raw?.tenant_id,
    revision: Number(raw?.revision) || 1,
    modules: { ...DEFAULT_TENANT_FEATURE_SETTINGS.modules, ...(raw?.modules ?? {}) },
    sections: {
      team_leader_portal: { ...DEFAULT_TENANT_FEATURE_SETTINGS.sections.team_leader_portal, ...(raw?.sections?.team_leader_portal ?? {}) },
      public_page: { ...DEFAULT_TENANT_FEATURE_SETTINGS.sections.public_page, ...(raw?.sections?.public_page ?? {}) },
    },
  };
}

export function useTenantFeatures(tenantId?: string | null, publicOnly = false) {
  const snapshot = usePublicSnapshot(tenantId, publicOnly);
  const query = useQuery({
    queryKey: ['tenant-features', publicOnly ? 'public' : 'admin', tenantId],
    enabled: !!tenantId && !(publicOnly && Platform.OS === 'web'),
    staleTime: 10_000,
    refetchInterval: publicOnly ? 10_000 : false,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        publicOnly ? 'get_public_tenant_feature_settings' : 'get_tenant_feature_settings',
        { p_tenant_id: tenantId },
      );
      if (error) throw new Error(error.message);
      return normalizeSettings(data, publicOnly);
    },
  });
  const freshPublicDirect = useFreshPublicQuery(query, publicOnly && !!tenantId);

  if (publicOnly && Platform.OS === 'web') {
    const settings = normalizeSettings(snapshot.data?.features ?? {
      public_page: false,
      public_leaderboard: false,
      sections: { schedule: false, results: false, participant_results: false, media: false },
    }, true);
    return { ...snapshot, data: settings, settings };
  }

  if (publicOnly) {
    const settings = freshPublicDirect.data ?? normalizeSettings({
      public_page: false,
      public_leaderboard: false,
      sections: { schedule: false, results: false, participant_results: false, media: false },
    }, true);
    return { ...freshPublicDirect, settings };
  }

  // Older sessions can briefly encounter a migration rollout window. The
  // server RPC remains authoritative after the migration is applied.
  return { ...query, settings: query.data ?? DEFAULT_TENANT_FEATURE_SETTINGS };
}
