import { supabase } from '../core/config/supabase';
import type { ScheduleLifecycleStatus } from '../core/utils/scheduleLifecycle';

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
  registration_scope_ambiguous?: boolean;
};

export type StageVenueRow = {
  id: string;
  tenant_id: string;
  festival_id: string;
  name: string;
  location: string | null;
  capacity: number | null;
  pin?: string;
};

export type StageRegistrationSummary = {
  schedule_id: string;
  active_count: number;
  verified_count: number;
  coded_count: number;
  rejected_count: number;
};

export type StageVenueSummarySchedule = StageScheduleRow & {
  registration_summary: Omit<StageRegistrationSummary, 'schedule_id'>;
};

export type StageRegistrationRow = {
  entry_kind?: 'participant' | 'general_team';
  entry_chest_number?: string | null;
  members?: { name: string; chest_number: string | null }[];
  id: string;
  schedule_id?: string | null;
  item_id: string;
  participant_id: string | null;
  organisation_id: string | null;
  status: string | null;
  is_verified: boolean | null;
  code_letter: string | null;
  code_letter_fixed?: boolean;
  participant_name: string | null;
  participant_chest_number: string | null;
  participant_category_code: string | null;
  organisation_name: string | null;
  organisation_type: string | null;
};

const throwIfError = (error: { message: string } | null) => {
  if (error) throw new Error(error.message);
};

const throwIfPortalError = (data: unknown) => {
  if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') {
    throw new Error(data.error);
  }
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
    const [{ data: venues, error: venuesError }, { data: codes, error: codesError }] = await Promise.all([
      supabase.rpc('get_stage_management_venues', { p_festival_id: festivalId }),
      supabase.rpc('get_stage_management_venue_codes', { p_festival_id: festivalId }),
    ]);
    throwIfError(venuesError);
    const codesUnavailable = codesError && ['42883', 'PGRST202'].includes((codesError as any).code);
    if (codesError && !codesUnavailable) throwIfError(codesError);
    const pinByVenue = new Map((codes ?? []).map((row: any) => [row.venue_id, row.pin]));
    return ((venues as StageVenueRow[] | null) ?? []).map((venue) => ({ ...venue, pin: pinByVenue.get(venue.id) as string | undefined }));
  },

  async getVenuePortalData(venueId: string, pin: string) {
    if (await this.getVenueReadMode(venueId) !== 'v1') {
      throw new Error('This Stage link uses v2. Refresh the page.');
    }
    const { data, error } = await supabase.rpc('stage_venue_portal_data_with_letters', { p_venue_id: venueId, p_pin: pin });
    throwIfError(error);
    throwIfPortalError(data);
    return data as { venue: { id: string; name: string; location: string | null }; schedules: StageScheduleRow[]; registrations: (StageRegistrationRow & { entry_kind?: string; members?: { name: string; chest_number: string | null }[] })[] };
  },

  async getVenueReadMode(venueId: string): Promise<'v1' | 'v2'> {
    const { data, error } = await supabase.rpc('stage_venue_portal_read_mode', { p_venue_id: venueId });
    throwIfError(error);
    return data === 'v2' ? 'v2' : 'v1';
  },

  async getManagementReadMode(): Promise<'v1' | 'v2'> {
    const { data, error } = await supabase.rpc('stage_management_read_mode');
    throwIfError(error);
    return data === 'v2' ? 'v2' : 'v1';
  },

  async isMainAdminDashboardEnabled(): Promise<boolean> {
    const { data, error } = await supabase.rpc('main_admin_dashboard_enabled');
    throwIfError(error);
    return data === true;
  },

  async getVenuePortalSummaryV2(venueId: string, pin: string) {
    const { data, error } = await supabase.rpc('stage_venue_portal_summary_v2', { p_venue_id: venueId, p_pin: pin });
    throwIfError(error);
    throwIfPortalError(data);
    return data as { venue: { id: string; name: string; location: string | null }; schedules: StageVenueSummarySchedule[] };
  },

  async getVenuePortalScheduleDetailV2(venueId: string, pin: string, scheduleId: string) {
    const { data, error } = await supabase.rpc('stage_venue_portal_schedule_detail_v2', {
      p_venue_id: venueId, p_pin: pin, p_schedule_id: scheduleId,
    });
    throwIfError(error);
    throwIfPortalError(data);
    return data as { registrations: StageRegistrationRow[] };
  },

  async getScheduleSummariesV2(festivalId: string): Promise<StageRegistrationSummary[]> {
    const { data, error } = await supabase.rpc('stage_management_schedule_summary_v2', { p_festival_id: festivalId });
    throwIfError(error);
    return (data as StageRegistrationSummary[] | null) ?? [];
  },

  async venuePortalUpdateRegistration(venueId: string, pin: string, scheduleId: string, registrationId: string, action: 'verify' | 'unverify' | 'reject' | 'restore') {
    const { data, error } = await supabase.rpc('stage_venue_portal_update_registration', {
      p_venue_id: venueId, p_pin: pin, p_schedule_id: scheduleId, p_registration_id: registrationId, p_action: action,
    });
    throwIfError(error);
    throwIfPortalError(data);
    return data;
  },

  async venuePortalUpdateCodeLetter(venueId: string, pin: string, scheduleId: string, registrationId: string, codeLetter: string,
    expectedLetter: string | null, expectedSwapId: string | null) {
    const { data, error } = await supabase.rpc('stage_venue_portal_edit_code_letter', {
      p_venue_id: venueId, p_pin: pin, p_schedule_id: scheduleId, p_registration_id: registrationId, p_code_letter: codeLetter,
      p_expected_letter: expectedLetter, p_expected_swap_id: expectedSwapId,
    });
    throwIfError(error);
    throwIfPortalError(data);
    return data;
  },

  async venuePortalDrawLetters(venueId: string, pin: string, scheduleId: string, overwrite: boolean) {
    const { data, error } = await supabase.rpc('stage_venue_portal_draw_letters', {
      p_venue_id: venueId, p_pin: pin, p_schedule_id: scheduleId, p_overwrite: overwrite,
    });
    throwIfError(error);
    throwIfPortalError(data);
    return data;
  },

  async venuePortalLockSchedule(venueId: string, pin: string, scheduleId: string) {
    const { data, error } = await supabase.rpc('stage_venue_portal_lock_schedule', {
      p_venue_id: venueId, p_pin: pin, p_schedule_id: scheduleId,
    });
    throwIfError(error);
    throwIfPortalError(data);
    return data;
  },

  async getRegistrations(options: { scheduleId?: string; festivalId?: string }): Promise<StageRegistrationRow[]> {
    if (!options.scheduleId && await this.getManagementReadMode() !== 'v1') {
      throw new Error('Stage overview uses v2 summaries. Refresh the page.');
    }
    let { data, error } = await supabase.rpc('get_stage_management_registrations_with_letters', {
      p_schedule_id: options.scheduleId ?? null,
      p_festival_id: options.festivalId ?? null,
    });
    const rpcMissingFromSchemaCache = error
      && ['42883', 'PGRST202'].includes((error as any).code);
    if (rpcMissingFromSchemaCache) {
      ({ data, error } = await supabase.rpc('get_stage_management_registrations_scoped', {
        p_schedule_id: options.scheduleId ?? null,
        p_festival_id: options.festivalId ?? null,
      }));
    }
    if (error && ['42883', 'PGRST202'].includes((error as any).code)) {
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

  async updateCodeLetter(scheduleId: string, registrationId: string, codeLetter: string,
    expectedLetter: string | null, expectedSwapId: string | null) {
    const { data, error } = await supabase.rpc('stage_edit_code_letter', {
      p_schedule_id: scheduleId,
      p_registration_id: registrationId,
      p_code_letter: codeLetter,
      p_expected_letter: expectedLetter,
      p_expected_swap_id: expectedSwapId,
    });
    throwIfError(error);
    return data;
  },

  async drawCodeLetters(scheduleId: string, overwrite: boolean) {
    const { data, error } = await supabase.rpc('stage_draw_code_letters', {
      p_schedule_id: scheduleId, p_overwrite: overwrite,
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

  async venuePortalSetScheduleStatus(venueId: string, pin: string, scheduleId: string, status: ScheduleLifecycleStatus, expectedStatus: string | null | undefined) {
    const { data, error } = await supabase.rpc('stage_venue_portal_set_schedule_status', {
      p_venue_id: venueId,
      p_pin: pin,
      p_schedule_id: scheduleId,
      p_status: status,
      p_expected_status: expectedStatus ?? null,
    });
    throwIfError(error);
    throwIfPortalError(data);
    return data;
  },
};
