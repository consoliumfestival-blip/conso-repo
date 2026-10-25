import type { TeamLeaderParticipantExportRow } from '@/services/participantExportService';

/** Match the existing Item Verification PDF labels; pending never means cancelled. */
export function getTeamScheduleParticipantStatus(row: Pick<TeamLeaderParticipantExportRow, 'registration_status' | 'is_verified'>) {
  const status = row.registration_status?.trim().toLowerCase();
  if (status === 'rejected') return 'Rejected';
  if (status === 'cancelled' || status === 'canceled') return 'Cancelled';
  return row.is_verified === true ? 'Verified' : 'Not Verified';
}

export function prepareTeamScheduleReport(rows: TeamLeaderParticipantExportRow[], itemId: string, teamId: string) {
  // Defence in depth; the RPC enforces this scope before returning any rows.
  const scoped = rows.filter(row => row.item_id === itemId && row.organisation_id === teamId && row.registration_id);
  return {
    participants: Array.from(new Map(scoped.map(row => [row.participant_id, {
      id: row.participant_id, name: row.participant_name, chest_number: row.chest_number,
      category_code: row.category_code, organisation_id: row.organisation_id, organisation_name: row.team_name,
    }])).values()),
    assignments: scoped.map(row => ({
      participant_id: row.participant_id, item_id: row.item_id!, registration_id: row.registration_id,
      registration_status: row.registration_status, is_verified: row.is_verified, entry_kind: row.entry_kind,
      organisation_id: row.organisation_id, organisation_name: row.team_name,
    })),
  };
}
