import { supabase } from '../core/config/supabase';

export type StageManagementContext = {
  tenant_id: string;
  festival_id: string;
  festival_name: string;
  festival_level: string | null;
};

export type StageScheduleRow = {
  id: string;
  tenant_id: string;
  festival_id: string;
  item_id: string;
  venue_id: string | null;
  start_time: string | null;
  end_time: string | null;
  status: string | null;
  is_shuffle_locked: boolean;
  shuffle_locked_at: string | null;
  item_code: string | null;
  item_name_en: string | null;
  item_name_ml: string | null;
  category_codes: string[] | null;
  venue_name: string | null;
};

export type StageVenueRow = {
  id: string;
  tenant_id: string;
  festival_id: string;
  name: string;
  location: string | null;
  capacity: number | null;
};

export type StageRegistrationRow = {
  id: string;
  schedule_id?: string | null;
  item_id: string;
  participant_id: string;
  organisation_id: string | null;
  status: string | null;
  is_verified: boolean | null;
  code_letter: string | null;
  participant_name: string | null;
  participant_chest_number: string | null;
  participant_category_code: string | null;
  organisation_name: string | null;
  organisation_type: string | null;
};

const throwIfError = (error: { message: string } | null) => {
  if (error) throw new Error(error.message);
};

export const stageManagementService = {
  async getContext(tenantId?: string | null): Promise<StageManagementContext | null> {
    const { data, error } = await supabase.rpc('get_stage_management_context');
    const rpcError = error as any;
    const rpcUnavailable = rpcError && ['42883', 'PGRST202'].includes(rpcError.code);

    if (error && !rpcUnavailable) {
      throwIfError(error);
    }

    const rpcContext = ((data as StageManagementContext[] | null) ?? [])[0] ?? null;
    if (rpcContext && (!tenantId || rpcContext.tenant_id === tenantId)) {
      return rpcContext;
    }

    // Older deployments may still expose an unscoped context RPC. Never use
    // that result for another tenant; resolve the active festival locally.
    if (!tenantId) return rpcContext;

    const { data: festival, error: festivalError } = await supabase
      .from('festival_calendar')
      .select('id, tenant_id, custom_name, level')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('festival_year', { ascending: false })
      .order('start_date', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    throwIfError(festivalError);
    if (!festival) return null;

    return {
      tenant_id: festival.tenant_id,
      festival_id: festival.id,
      festival_name: festival.custom_name?.trim()
        || String(festival.level || 'festival').replace(/^./, (letter) => letter.toUpperCase()) + ' Festival',
      festival_level: festival.level,
    };
  },

  async getSchedules(festivalId: string): Promise<StageScheduleRow[]> {
    const { data, error } = await supabase.rpc('get_stage_management_schedules', {
      p_festival_id: festivalId,
    });
    throwIfError(error);
    return (data as StageScheduleRow[] | null) ?? [];
  },

  async getVenues(festivalId: string): Promise<StageVenueRow[]> {
    const { data, error } = await supabase.rpc('get_stage_management_venues', {
      p_festival_id: festivalId,
    });
    throwIfError(error);
    return (data as StageVenueRow[] | null) ?? [];
  },

  async getRegistrations(options: { scheduleId?: string; festivalId?: string }): Promise<StageRegistrationRow[]> {
    let { data, error } = await supabase.rpc('get_stage_management_registrations_scoped', {
      p_schedule_id: options.scheduleId ?? null,
      p_festival_id: options.festivalId ?? null,
    });
    const rpcMissingFromSchemaCache = error
      && ['42883', 'PGRST202'].includes((error as any).code);
    if (rpcMissingFromSchemaCache) {
      ({ data, error } = await supabase.rpc('get_stage_management_registrations', {
        p_schedule_id: options.scheduleId ?? null,
        p_festival_id: options.festivalId ?? null,
      }));
    }
    throwIfError(error);

    // Keep production check-in compatible with deployments whose scoped RPC
    // was refreshed before the latest schema-cache notification. The legacy
    // RPC is also tenant/festival scoped on the database and is only used
    // when the scoped call succeeds but returns no rows.
    if (!error && (!data || data.length === 0) && options.scheduleId) {
      const fallback = await supabase.rpc('get_stage_management_registrations', {
        p_schedule_id: options.scheduleId,
        p_festival_id: options.festivalId ?? null,
      });
      if (!fallback.error && fallback.data && fallback.data.length > 0) {
        return fallback.data as StageRegistrationRow[];
      }
    }

    return (data as StageRegistrationRow[] | null) ?? [];
  },

  async updateRegistration(scheduleId: string, registrationId: string, action: 'verify' | 'unverify' | 'reject' | 'restore') {
    const { data, error } = await supabase.rpc('stage_update_registration', {
      p_schedule_id: scheduleId,
      p_registration_id: registrationId,
      p_action: action,
    });
    throwIfError(error);
    return data;
  },

  async updateCodeLetter(scheduleId: string, registrationId: string, codeLetter: string) {
    const { data, error } = await supabase.rpc('stage_update_code_letter', {
      p_schedule_id: scheduleId,
      p_registration_id: registrationId,
      p_code_letter: codeLetter,
    });
    throwIfError(error);
    return data;
  },

  async updateScheduleLock(scheduleId: string, locked: boolean) {
    const { data, error } = await supabase.rpc('stage_update_schedule_lock', {
      p_schedule_id: scheduleId,
      p_locked: locked,
    });
    throwIfError(error);
    return data;
  },
};
