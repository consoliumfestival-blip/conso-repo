import { supabase } from '../core/config/supabase';

/**
 * Read-only boundary for the Admin Portal Assistant.
 *
 * This module deliberately uses fixed table/view names and SELECT-only
 * queries. It relies on the authenticated Supabase session and existing RLS;
 * it never uses a service-role key or accepts arbitrary SQL from the chat UI.
 */
export type AdminReadOnlyScope = {
  tenantId: string;
  festivalId?: string | null;
};

type CountResult = { label: string; count: number };

const activeRegistrationFilter = (query: any) => query.neq('status', 'rejected');

const escapeSearchTerm = (value: string) => value.replace(/[\\%,()]/g, '\\$&');

const countRows = async (
  table: string,
  scope: AdminReadOnlyScope,
  festivalScoped = true,
): Promise<number> => {
  let query = supabase.from(table).select('*', { count: 'exact', head: true }).eq('tenant_id', scope.tenantId);
  if (festivalScoped && scope.festivalId) query = query.eq('festival_id', scope.festivalId);
  if (table === 'registrations' || table === 'participants') query = activeRegistrationFilter(query);
  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
};

const extractSearchTerm = (message: string) => message
  .replace(/\b(show|find|search|look|up|details|about|profile|participant|candidate|student|registration|for|me|the|of|is|who|what|tell|give|please|public|active|festival|schedule|result|results)\b/gi, ' ')
  .replace(/[^\p{L}\p{N}_ -]/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const tenantOverview = async (scope: AdminReadOnlyScope): Promise<CountResult[]> => {
  const [participants, registrations, items, schedules, venues, judges, results, announcements, attendance, organisations] = await Promise.all([
    countRows('participants', scope),
    countRows('registrations', scope),
    countRows('items', scope),
    countRows('schedules', scope),
    countRows('venues', scope),
    countRows('judges', scope),
    countRows('results', scope),
    countRows('announcements', scope),
    countRows('attendance', scope, false),
    countRows('organisations', scope, false),
  ]);
  return [
    { label: 'participants', count: participants },
    { label: 'active registrations', count: registrations },
    { label: 'items', count: items },
    { label: 'scheduled events', count: schedules },
    { label: 'venues', count: venues },
    { label: 'judges', count: judges },
    { label: 'results', count: results },
    { label: 'announcements', count: announcements },
    { label: 'attendance records', count: attendance },
    { label: 'organisations', count: organisations },
  ];
};

const readTenantParticipants = async (scope: AdminReadOnlyScope, searchTerm: string) => {
  let query = supabase
    .from('participants')
    .select('id,name,chest_number,category_code,gender,status,organisation_id,organisations(name)')
    .eq('tenant_id', scope.tenantId)
    .neq('status', 'rejected')
    .limit(20);
  if (scope.festivalId) query = query.eq('festival_id', scope.festivalId);
  if (searchTerm) {
    const safeSearchTerm = escapeSearchTerm(searchTerm);
    query = query.or(`name.ilike.%${safeSearchTerm}%,chest_number.ilike.%${safeSearchTerm}%`);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((row: any) => `${row.name} (${row.chest_number || 'No chest'}, ${row.category_code || 'No category'}, ${row.organisations?.name || 'No organisation'})`);
};

const readTenantItems = async (scope: AdminReadOnlyScope) => {
  let query = supabase
    .from('items')
    .select('item_code,item_name_en,item_name_ml,category_codes,participation_type,is_active')
    .eq('tenant_id', scope.tenantId)
    .eq('is_active', true)
    .order('item_code')
    .limit(200);
  if (scope.festivalId) query = query.eq('festival_id', scope.festivalId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
};

const readTenantSchedules = async (scope: AdminReadOnlyScope) => {
  let query = supabase
    .from('schedules')
    .select('id,start_time,end_time,status,items(item_code,item_name_en,item_name_ml,category_codes),venues(name,location)')
    .eq('tenant_id', scope.tenantId)
    .order('start_time', { ascending: true })
    .limit(200);
  if (scope.festivalId) query = query.eq('festival_id', scope.festivalId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
};

const readPublicActiveFestival = async (festivalId: string) => {
  const [{ data: schedules, error: schedulesError }, { data: results, error: resultsError }] = await Promise.all([
    supabase.from('vw_public_schedule').select('item_code,item_name,item_name_ml,item_category_codes,venue_name,start_time,status').eq('festival_id', festivalId).order('start_time').limit(300),
    supabase.from('vw_public_results').select('item_name,item_name_ml,organisation_name,participant_name,rank,grade,points_awarded,published_at').eq('festival_id', festivalId).order('published_at', { ascending: false }).limit(300),
  ]);
  if (schedulesError) throw schedulesError;
  if (resultsError) throw resultsError;
  return { schedules: schedules || [], results: results || [] };
};

const formatOverview = (counts: CountResult[]) => counts.map((entry) => `${entry.count} ${entry.label}`).join(' · ');

export async function getAdminReadOnlyAgentResponse(message: string, scope: AdminReadOnlyScope): Promise<string | null> {
  const lower = message.toLowerCase();
  const publicOnly = /\b(public|published)\b/.test(lower) && /\b(schedule|event|result|leaderboard)\b/.test(lower);

  if (publicOnly && scope.festivalId) {
    const data = await readPublicActiveFestival(scope.festivalId);
    if (/result|leaderboard/.test(lower)) {
      return `Active festival public results: ${data.results.length} published rows available. Other tenants' private data is not included.`;
    }
    return `Active festival public schedule: ${data.schedules.length} public schedule rows available. Other tenants' private data is not included.`;
  }

  if (/overview|summary|stats|count|how many|total/.test(lower)) {
    const counts = await tenantOverview(scope);
    return `Current tenant read-only overview: ${formatOverview(counts)}.`;
  }

  if (/participant|candidate|student|registration|profile/.test(lower)) {
    const term = extractSearchTerm(message);
    if (term.length > 1) {
      const rows = await readTenantParticipants(scope, term);
      return rows.length ? `Current tenant matches: ${rows.join('; ')}.` : `No current-tenant participant matched “${term}”.`;
    }
    const count = await countRows('participants', scope);
    return `Current tenant has ${count} active participants. Private data from other tenants is excluded.`;
  }

  if (/item|category|competition/.test(lower)) {
    const items = await readTenantItems(scope);
    return `Current tenant has ${items.length} active items. Categories are tenant-scoped; other tenants' item data is excluded.`;
  }

  if (/schedule|event|venue|stage/.test(lower)) {
    const schedules = await readTenantSchedules(scope);
    return `Current tenant has ${schedules.length} scheduled events. Schedule details are tenant-scoped.`;
  }

  if (/result|mark|score|winner|publish/.test(lower)) {
    const count = await countRows('results', scope);
    return `Current tenant has ${count} result records. Unpublished results are available only within the current tenant; public cross-tenant results require the public/published query.`;
  }

  return null;
}
