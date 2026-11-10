// Browser verification only. Never imported by the application or its routes.
import React from 'react';
import { View } from 'react-native';
import { createTeamUi } from '../../src/constants/teamLeaderTheme';

declare global { interface Window { popupFixture: any; } }
export const fixtureContext = { assignment_id: 'assignment', parent_tenant_id: 'tenant', festival_id: 'festival', festival_team_id: 'festival-team', organisation_id: 'team', team_name: 'LA-COSMIX', festival_name: 'Fixture Festival' };
export const fixtureEvent = { schedule_id: 'schedule', item_id: 'item', item_name: 'Speech Competition', item_code: 'S1', category_codes: ['JR'], participant_count: 24, checked_in_count: 12, event_status: 'scheduled', start_time: null, end_time: null, venue_name: 'Main Stage' };
export const fixtureRows = Array.from({ length: 24 }, (_, i) => ({ participant_id: `p${i}`, participant_name: i === 0 ? 'A very long participant name to verify wrapping on narrow screens' : `Participant ${i + 1}`, gender: 'male', category_code: 'JR', chest_number: String(101 + i), participant_status: 'approved', organisation_id: 'team', team_name: 'LA-COSMIX', item_id: 'item', item_code: 'S1', item_name_en: 'Speech Competition', item_name_ml: null, item_category_codes: ['JR'], participation_type: 'individual', entry_kind: i < 2 ? 'general_team' : 'participant', registration_id: i < 2 ? 'group' : `r${i}`, registration_status: i === 3 ? 'rejected' : i === 4 ? 'cancelled' : 'pending', is_verified: i !== 2 }));
export function useTeamUi() { return createTeamUi(window.popupFixture.dark ? 'dark' : 'light', 'LA-COSMIX'); }
export function useTeamTheme() { return { ui: useTeamUi(), mode: 'light', toggleMode: () => {} }; }
export function useTeamLeaderContext() { return { context: window.popupFixture.context || fixtureContext, loading: false, refetch: async () => { window.popupFixture.contextCalls = (window.popupFixture.contextCalls || 0) + 1; }, invalidateAccess: () => {} }; }
export function useAuthStore(selector?: (state: any) => any) { const state = { user: { id: window.popupFixture.userId || 'fixture-user' }, tenant_id: 'tenant', role: 'team_leader', logoutTeamLeader: async () => {} }; return selector ? selector(state) : state; }
export function useFocusEffect(callback: () => void | (() => void)) { React.useEffect(callback, [callback]); }
export function TeamLeaderAppShell({ children }: { children: React.ReactNode }) { return <View style={{ padding: 16 }}>{children}</View>; }
export function useRouter() { return { push: () => { window.popupFixture.navigationCount += 1; } }; }
export const supabase = {};
export const documentDirectory = '';
export const writeAsStringAsync = async () => { throw new Error('Native file writes are outside this browser fixture.'); };
export const isAvailableAsync = async () => false;
export const shareAsync = async () => { throw new Error('Native sharing is outside this browser fixture.'); };
export const festivalCategoryService = { list: async () => [] };
export const teamLeaderPortalService = {
  getItemLimitStatus: async () => { window.popupFixture.limitCalls = (window.popupFixture.limitCalls || 0) + 1; return []; },
  getProgramsForTeamPage: async () => { window.popupFixture.programCalls = (window.popupFixture.programCalls || 0) + 1; return { rows: [], page: 1, page_size: 25, has_more: false, has_previous: false, available_count: 0, active_count: 0, category_codes: [] }; },
  getPublishedResults: async () => { window.popupFixture.resultsCalls = (window.popupFixture.resultsCalls || 0) + 1; return []; },
  getStandings: async () => { window.popupFixture.standingsCalls = (window.popupFixture.standingsCalls || 0) + 1; return []; },
  getParticipants: async () => { window.popupFixture.participantCalls = (window.popupFixture.participantCalls || 0) + 1; return []; },
  getAnnouncements: async () => { window.popupFixture.announcementCalls = (window.popupFixture.announcementCalls || 0) + 1; return []; },
  getProgramsForParticipant: async () => [],
  getSchedule: async () => {
    const state = window.popupFixture;
    state.scheduleCalls = (state.scheduleCalls || 0) + 1;
    const params = new URLSearchParams({ name: state.scheduleName || fixtureEvent.item_name, delay: String(state.scheduleDelay ?? 0), error: String(state.scheduleError || '') });
    const response = await fetch(`/fixture-schedule?${params}`);
    const result = await response.json();
    if (!response.ok) throw result;
    return [{ ...fixtureEvent, item_name: result.name }];
  },
  getScheduleParticipants: async () => {
    const state = window.popupFixture;
    const context = state.context || fixtureContext;
    const rows = fixtureRows.map(row => ({ ...row, organisation_id: context.organisation_id,
      team_name: context.team_name, participant_name: state.context ? `Replacement ${row.participant_name}` : row.participant_name }));
    state.calls += 1;
    await new Promise(resolve => setTimeout(resolve, state.delay ?? 0));
    if (state.error) throw new Error('Fixture network error');
    return { schedule_id: 'schedule', item_id: state.wrongItem ? 'other' : 'item', checkin_complete: state.complete, participants: state.empty ? [] : rows };
  },
};
