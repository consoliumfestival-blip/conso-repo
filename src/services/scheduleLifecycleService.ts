import { supabase } from '@/core/config/supabase';
import { ScheduleLifecycleStatus } from '@/core/utils/scheduleLifecycle';

export const scheduleLifecycleService = {
  async setStatus(scheduleId: string, status: ScheduleLifecycleStatus, expectedStatus: string | null | undefined) {
    const { data, error } = await supabase.rpc('stage_set_schedule_status', {
      p_schedule_id: scheduleId,
      p_status: status,
      p_expected_status: expectedStatus ?? null,
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  },

  async setVenuePortalStatus(venueId: string, pin: string, scheduleId: string, status: ScheduleLifecycleStatus, expectedStatus: string | null | undefined) {
    const { data, error } = await supabase.rpc('stage_venue_portal_set_schedule_status', {
      p_venue_id: venueId,
      p_pin: pin,
      p_schedule_id: scheduleId,
      p_status: status,
      p_expected_status: expectedStatus ?? null,
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  },
};
