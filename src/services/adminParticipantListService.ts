import { supabase } from '../core/config/supabase';

export type AdminParticipantFilters = {
  search: string; category: string | null; status: string | null; gender: string | null;
  festivalId: string | null; itemId: string | null; competitionCategory: string | null;
};

const BATCH_SIZE = 500;

function responseRows<T>(data: unknown, label: string): T[] {
  if (data == null) return [];
  if (!Array.isArray(data)) throw new Error(`${label} response was not a row list.`);
  return data as T[];
}

function filteredQuery(filters: AdminParticipantFilters, count = false, columns = '*, organisations(id, name, org_type)', signal?: AbortSignal) {
  let query = supabase.rpc('admin_filtered_participants', {
    p_search: filters.search, p_category: filters.category, p_status: filters.status,
    p_gender: filters.gender, p_festival_id: filters.festivalId, p_item_id: filters.itemId,
    p_competition_category: filters.competitionCategory,
  }, count ? { count: 'exact' } : undefined);
  if (signal) query = query.abortSignal(signal);
  return query
    .select(columns)
    .order('created_at', { ascending: false, nullsFirst: true })
    .order('id', { ascending: false });
}

export async function loadAdminParticipantPage(filters: AdminParticipantFilters, page: number, pageSize: number, signal?: AbortSignal) {
  const { data, error, count } = await filteredQuery(filters, true, 'id,name,chest_number,category_code,gender,status,created_at,profile_slug,organisations(id,name,org_type)', signal).range(page * pageSize, (page + 1) * pageSize - 1);
  if (error) throw error;
  if (count == null) throw new Error('Participant count unavailable.');
  return { participants: responseRows<any>(data, 'Participant'), count };
}

export async function loadAllAdminParticipants(filters: AdminParticipantFilters, idsOnly = false) {
  const rows: any[] = [];
  let expectedCount: number | null = null;
  for (let offset = 0; ; offset += BATCH_SIZE) {
    const { data, error, count } = await filteredQuery(filters, true, idsOnly ? 'id' : undefined).range(offset, offset + BATCH_SIZE - 1);
    if (error) throw error;
    if (count == null) throw new Error('Participant count unavailable.');
    if (expectedCount !== null && count !== expectedCount) throw new Error('Participants changed while loading. Please retry.');
    expectedCount = count;
    const batch = responseRows<any>(data, 'Participant');
    rows.push(...batch);
    if (rows.length >= count) {
      if (rows.length !== count || new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('Participants changed while loading. Please retry.');
      return rows;
    }
    if (!batch.length) throw new Error('Participant list is incomplete. Please retry.');
  }
}

export async function loadAdminParticipantCategories() {
  const codes: string[] = [];
  for (let offset = 0; ; offset += BATCH_SIZE) {
    const { data, error } = await supabase.rpc('admin_participant_categories').select('category_code').order('category_code').range(offset, offset + BATCH_SIZE - 1);
    if (error) throw error;
    const batch = responseRows<{ category_code: string }>(data, 'Category');
    codes.push(...batch.map((row) => row.category_code));
    if (batch.length < BATCH_SIZE) return codes.sort((a, b) => a.localeCompare(b));
  }
}

// Export reads are intentionally separate from the page query and run only for
// the chosen report. All reads use the same authenticated client and table RLS.
export async function loadAdminExportTeams(festivalId: string) {
  const teams = new Map<string, { id: string; label: string }>();
  let lastId: string | null = null;
  for (;;) {
    let query = supabase.from('participants').select('id, organisation_id, organisations(id, name)')
      .eq('festival_id', festivalId).order('id').limit(BATCH_SIZE);
    if (lastId) query = query.gt('id', lastId);
    const { data, error } = await query;
    if (error) throw error;
    if (!data?.length) return Array.from(teams.values()).sort((a, b) => a.label.localeCompare(b.label));
    data.forEach((row: any) => { if (row.organisation_id && row.organisations?.name) teams.set(row.organisation_id, { id: row.organisation_id, label: row.organisations.name }); });
    const nextId = data[data.length - 1].id;
    if (!nextId || nextId === lastId) throw new Error('Team pagination did not advance.');
    lastId = nextId;
  }
}

export async function loadAdminExportRegistrations(festivalId: string, itemId: string | null) {
  const rows: any[] = [];
  let lastId: string | null = null;
  for (;;) {
    let query = supabase.from('registrations')
      .select('id, item_id, participant_id, organisation_id, tenant_id, festival_id, entry_kind, status, is_verified, code_letter')
      .eq('festival_id', festivalId).order('id').limit(BATCH_SIZE);
    if (itemId) query = query.eq('item_id', itemId);
    if (lastId) query = query.gt('id', lastId);
    const { data, error } = await query;
    if (error) throw error;
    if (!data?.length) return rows;
    rows.push(...data);
    const nextId = data[data.length - 1].id;
    if (!nextId || nextId === lastId) throw new Error('Registration pagination did not advance.');
    lastId = nextId;
  }
}

// Team reports need organisation-owned entries plus null-organisation entries
// linked to a visible team participant. Each branch remains subject to table RLS.
export async function loadAdminTeamExportRegistrations(festivalId: string, teamId: string, participantIds: string[]) {
  const registrations = new Map<string, any>();
  const columns = 'id, item_id, participant_id, organisation_id, tenant_id, festival_id, entry_kind, status, is_verified, code_letter';
  const readRegistrations = async (kind: 'team' | 'direct' | 'group', ids: string[] = []) => {
    let lastId: string | null = null;
    for (;;) {
      let query = supabase.from('registrations').select(columns)
        .eq('festival_id', festivalId).order('id').limit(BATCH_SIZE);
      if (kind === 'team') query = query.eq('organisation_id', teamId);
      else {
        query = query.is('organisation_id', null);
        query = kind === 'direct' ? query.in('participant_id', ids) : query.is('participant_id', null).in('id', ids);
      }
      if (lastId) query = query.gt('id', lastId);
      const { data, error } = await query;
      if (error) throw error;
      if (!data?.length) return;
      data.forEach(row => registrations.set(row.id, row));
      const nextId = data[data.length - 1].id;
      if (!nextId || nextId === lastId) throw new Error('Registration pagination did not advance.');
      lastId = nextId;
    }
  };

  await readRegistrations('team');
  const groupRegistrationIds = new Set<string>();
  const uniqueParticipantIds = [...new Set(participantIds)];
  for (let start = 0; start < uniqueParticipantIds.length; start += 100) {
    const chunk = uniqueParticipantIds.slice(start, start + 100);
    await readRegistrations('direct', chunk);
    let lastId: string | null = null;
    for (;;) {
      // The inner join applies registration SELECT RLS before membership IDs
      // reach the client, even when group_members itself has broad policies.
      let query = supabase.from('group_members').select('id, registration_id, registrations!inner(festival_id)')
        .eq('registrations.festival_id', festivalId)
        .in('participant_id', chunk).order('id').limit(BATCH_SIZE);
      if (lastId) query = query.gt('id', lastId);
      const { data, error } = await query;
      if (error) throw error;
      if (!data?.length) break;
      data.forEach(row => { if (row.registration_id) groupRegistrationIds.add(row.registration_id); });
      const nextId = data[data.length - 1].id;
      if (!nextId || nextId === lastId) throw new Error('Group member pagination did not advance.');
      lastId = nextId;
    }
  }
  const groupIds = [...groupRegistrationIds];
  for (let start = 0; start < groupIds.length; start += 100) {
    await readRegistrations('group', groupIds.slice(start, start + 100));
  }
  return [...registrations.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export async function loadAdminExportGroupMembers(registrations: { id: string; participant_id?: string | null }[], teamParticipantIds?: string[]) {
  const ids = registrations.filter(row => !row.participant_id).map(row => row.id);
  const rows: { registration_id: string; participant_id: string }[] = [];
  const participantChunks = teamParticipantIds === undefined ? [null] : Array.from({ length: Math.ceil(teamParticipantIds.length / 100) }, (_, i) => teamParticipantIds.slice(i * 100, (i + 1) * 100));
  for (let start = 0; start < ids.length; start += 100) {
    for (const participantChunk of participantChunks) {
    let lastId: string | null = null;
    for (;;) {
      let query = supabase.from('group_members').select('id, registration_id, participant_id')
        .in('registration_id', ids.slice(start, start + 100)).order('id').limit(BATCH_SIZE);
      if (participantChunk) query = query.in('participant_id', participantChunk);
      if (lastId) query = query.gt('id', lastId);
      const { data, error } = await query;
      if (error) throw error;
      if (!data?.length) break;
      rows.push(...data);
      const nextId = data[data.length - 1].id;
      if (!nextId || nextId === lastId) throw new Error('Group member pagination did not advance.');
      lastId = nextId;
    }
    }
  }
  return rows;
}

export async function loadAdminExportPeople(festivalId: string, teamId: string | null, participantIds: string[] | null) {
  const rows: any[] = [];
  const chunks = participantIds ? Array.from({ length: Math.ceil(participantIds.length / 100) }, (_, i) => participantIds.slice(i * 100, (i + 1) * 100)) : [null];
  for (const chunk of chunks) {
    let lastId: string | null = null;
    for (;;) {
      let query = supabase.from('participants').select('*, organisations(id, name, org_type)')
        .eq('festival_id', festivalId).order('id').limit(BATCH_SIZE);
      if (teamId) query = query.eq('organisation_id', teamId);
      if (chunk) query = query.in('id', chunk);
      if (lastId) query = query.gt('id', lastId);
      const { data, error } = await query;
      if (error) throw error;
      if (!data?.length) break;
      rows.push(...data);
      const nextId = data[data.length - 1].id;
      if (!nextId || nextId === lastId) throw new Error('Export participant pagination did not advance.');
      lastId = nextId;
    }
  }
  return rows;
}
