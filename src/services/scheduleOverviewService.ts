import { supabase } from '../core/config/supabase';
export type ScheduleWorkflowSummary = { schedule_id: string; active_count: number; verified_count: number; coded_count: number; rejected_count: number; assigned_judges: number; submitted_judges: number; marks_completed: boolean; has_manual_result: boolean; has_published_result: boolean; };
export type ScheduleOverviewFilters = {
 search?: string;
 itemId?: string | null;
 category?: string | null;
 venueId?: string | null;
 date?: string | null;
 workflowStatus?: string | null;
 timezone?: string;
 asOf?: string | null;
};
export type ScheduleOverviewPageRequest = ScheduleOverviewFilters & {
 tenantId: string;
 festivalId: string;
 page: number;
 pageSize: number;
};
export type ScheduleOverviewPage = {
 rows: any[];
 totalCount: number;
 festivalTotalCount: number;
 asOf: string | null;
};

const toRpcParams = (input: ScheduleOverviewPageRequest) => ({
 p_tenant_id: input.tenantId,
 p_festival_id: input.festivalId,
 p_search: input.search?.trim() || null,
 p_item_id: input.itemId || null,
 p_category: input.category || null,
 p_venue_id: input.venueId || null,
 p_date: input.date || null,
 p_workflow_status: input.workflowStatus || null,
 p_page: input.page,
 p_page_size: input.pageSize,
 p_timezone: input.timezone || 'Asia/Kolkata',
 p_as_of: input.asOf || null,
});

const normalizeScheduleRows = (rows: any[]) => rows.map((row) => ({
 ...row,
 id: row.id ?? row.schedule_id,
 venues: row.venue_id ? { id: row.venue_id, name: row.venue_name } : null,
 items: {
  id: row.item_id,
  item_code: row.item_code,
  item_name_en: row.item_name_en,
  item_name_ml: row.item_name_ml,
  category_codes: row.category_codes ?? [],
 },
}));

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
 async page(input: ScheduleOverviewPageRequest, signal?: AbortSignal): Promise<ScheduleOverviewPage> {
  let request = supabase.rpc('admin_schedule_overview_page', toRpcParams(input));
  if (signal) request = request.abortSignal(signal);
  const { data, error } = await request;
  if (error) throw error;
  const response = (data ?? {}) as { rows?: any[]; total_count?: number; festival_total_count?: number; as_of?: string };
  return {
   rows: normalizeScheduleRows(response.rows ?? []),
   totalCount: Number(response.total_count ?? 0),
   festivalTotalCount: Number(response.festival_total_count ?? 0),
   asOf: response.as_of ?? null,
  };
 },
 async allFiltered(input: Omit<ScheduleOverviewPageRequest, 'page' | 'pageSize'>): Promise<any[]> {
  const pageSize = 100;
  const rows: any[] = [];
  const seenIds = new Set<string>();
  let page = 1;
  let expectedTotal: number | null = null;
  let stableAsOf = input.asOf ?? null;
  do {
   const result = await this.page({ ...input, asOf: stableAsOf, page, pageSize });
   if (stableAsOf === null) stableAsOf = result.asOf;
   if (expectedTotal === null) expectedTotal = result.totalCount;
   else if (result.totalCount !== expectedTotal) {
    throw new Error('Schedule results changed during PDF export. Please retry the export.');
   }
   if (result.rows.length === 0) {
    if (rows.length < expectedTotal) throw new Error('Schedule results changed during PDF export. Please retry the export.');
    break;
   }
   for (const row of result.rows) {
    const rowId = String(row.id ?? row.schedule_id ?? '');
    if (rowId && seenIds.has(rowId)) {
     throw new Error('Schedule results changed during PDF export. Please retry the export.');
    }
    if (rowId) seenIds.add(rowId);
    rows.push(row);
   }
   if (rows.length >= expectedTotal) break;
   page += 1;
  } while (true);
  if (rows.length !== expectedTotal) throw new Error('Schedule results changed during PDF export. Please retry the export.');
  return rows;
 },
 async availableDates(tenantId: string, festivalId: string, timezone: string, signal?: AbortSignal): Promise<string[]> {
  let request = supabase.rpc('admin_schedule_available_dates', {
   p_tenant_id: tenantId,
   p_festival_id: festivalId,
   p_timezone: timezone,
  });
  if (signal) request = request.abortSignal(signal);
  const { data, error } = await request;
  if (error) throw error;
  return (data ?? []) as string[];
 },
};
