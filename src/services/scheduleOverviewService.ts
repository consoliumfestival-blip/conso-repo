import { supabase } from '../core/config/supabase';
export type ScheduleWorkflowSummary = { schedule_id: string; active_count: number; verified_count: number; coded_count: number; rejected_count: number; assigned_judges: number; submitted_judges: number; marks_completed: boolean; has_manual_result: boolean; has_published_result: boolean; };
export const scheduleOverviewService = {
 async workflow(tenantId: string, festivalId: string, signal?: AbortSignal): Promise<ScheduleWorkflowSummary[]> {
  let request = supabase.rpc('admin_schedule_workflow_overview', {p_tenant_id:tenantId,p_festival_id:festivalId});
  if (signal) request=request.abortSignal(signal);
  const {data,error}=await request; if(error) throw error;
  return (data ?? []).map((row: ScheduleWorkflowSummary) => ({...row,active_count:Number(row.active_count),verified_count:Number(row.verified_count),coded_count:Number(row.coded_count),rejected_count:Number(row.rejected_count),assigned_judges:Number(row.assigned_judges),submitted_judges:Number(row.submitted_judges)}));
 },
 async schedules(tenantId: string, festivalId: string) {
  const {data,error}=await supabase.from('schedules').select('id,tenant_id,festival_id,item_id,venue_id,status,start_time,end_time,is_shuffle_locked,is_public_visible,venues(id,name),items(id,item_code,item_name_en,item_name_ml,category_codes)').eq('tenant_id',tenantId).eq('festival_id',festivalId).order('start_time');
  if(error) throw error; return data ?? [];
 },
};
