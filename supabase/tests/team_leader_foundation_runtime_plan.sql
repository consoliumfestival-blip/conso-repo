-- Disposable/local Team Leader foundation test plan. Not executable as-is and
-- intentionally not run by this task.
--
-- Fixtures: two tenants, two festivals, two active teams per festival,
-- participants/registrations (individual and group), verified registrations,
-- attendance, published/draft/hidden results, rank 4+, grade-only results,
-- general/team-leader/judge/admin announcements, and portal windows.
-- Actors: Team Leaders A/B/other-tenant/revoked/expired/future-valid,
-- Festival Admin, Super Admin, Judge, Stage Manager, normal auth, anon.

-- RPC assertions:
-- get_team_leader_context() resolves only an active, open assignment.
-- Participants, schedules, results, announcements never cross team/tenant.
-- Revoked/expired/future/inactive/disabled/closed contexts return no rows.
-- Results require published=true, result_status='published', and
-- public_visible=true; rank 4+ and NULL-rank grade-only rows remain valid.
-- Standings equal get_public_leaderboard for the same festival.

-- Direct-access assertions (must fail for Team Leader):
-- SELECT * FROM schedules; SELECT * FROM venues; SELECT * FROM attendance;
-- SELECT * FROM point_table; SELECT * FROM announcements;
-- SELECT * FROM group_members;
-- INSERT/UPDATE/DELETE on participants, attendance, mark_entries, results,
-- point_table, and team_portal_settings.

-- Regression assertions:
-- anon sees only active-festival visible schedules/venues;
-- admin/stage check-in uses registrations.is_verified;
-- judge mark RPCs and public results/leaderboard remain functional.

-- Privilege assertions: internal SECURITY DEFINER helpers are not executable
-- by PUBLIC/anon/authenticated; only approved Team Leader RPCs are callable.
