# Team Leader schedule participants

Implemented on `codex/team-schedule-participant-popup`, integrated with target
`conso-repo` main `2ed7eac9817e16e4a8b32c4f4630a8074dd438d3` before release.
The read-only RPC migration was applied with explicit user approval to target
Supabase `negkevoetuvuqqlecdno`. Its recorded version is `20261025174415`;
the local filename matches that database history entry.

## User flow and data flow

Select a Schedule card → responsive popup → one conditional
`get_team_leader_schedule_participants(p_schedule_id)` RPC → authenticated active
assignment resolution → validate schedule tenant/festival/item → read check-in
completion and own-team export rows in one database statement snapshot → display.
No route navigation or data mutation is involved. No background polling is added.
Refresh reads the same endpoint. Close/unmount invalidates in-flight responses.
The popup is keyed by assignment/festival/team/schedule to avoid carrying data
between portal scopes.

Before check-in completes, rows use muted styling and export is unavailable.
After completion, `Verified`, `Not Verified`, `Rejected`, and `Cancelled` match
the existing shared PDF renderer. Pending never implies cancelled. General
group members inherit the registration's verification state; this is not
individual member attendance. Every member retains their own chest number.

Item Verification PDF → re-read the same RPC → check current eligibility →
pass only selected item/own-team rows to existing `downloadItemVerificationPdf`.
The renderer and Admin/Team Leader Participants exports are unchanged. Native
platforms can view the list; the existing PDF renderer remains browser-only.

## API, permissions and database impact

- Existing schedule/context reads remain REQUIRED and unchanged.
- Popup open, Refresh and PDF click each make one CONDITIONAL read; there is no
  per-student query, duplicate export fetch, new direct table read or broad refetch.
- The new public function is SECURITY INVOKER, delegating to a private STABLE
  SECURITY DEFINER function with an empty search path and explicit identity and
  assignment checks. PUBLIC/anon execution is revoked on both functions.
- Own-team roster data comes from the existing
  `private.get_team_leader_participant_export_rows()` source. It retains rejected
  and cancelled registrations and expands general-group membership.
- Only the completion boolean spans other visible teams. Their students,
  registration counts, marks, results and code letters are not returned.
- Completion matches the existing Admin schedule card: at least one non-rejected
  visible registration and all such registrations verified, OR shuffle locked.
  Event lifecycle and own-team checked-in totals are not completion signals.
  The existing Admin filters' differing lock treatment is not changed here.
- Registrations are currently associated with festival/item; the popup does not
  invent per-slot attendance for repeated schedules of the same item.
- Migration `20261025174415_team_leader_schedule_participant_details.sql` adds
  two read functions only. It requires the existing export migration
  `20261024130233_team_leader_participant_export_rows.sql`. No existing table,
  column, constraint, policy, mutation, history or transaction contract changes.
- Reads reflect the snapshot at request time; they do not freeze later coordinator
  edits. PDF eligibility is refreshed immediately before generating the report.

## Validation on 2026-10-25

- `node --test tests/team-schedule-participants.test.cjs tests/team-schedule-participants-db.test.cjs`:
  19/19 pass, including PostgreSQL permissions, cross-tenant/festival denial,
  revoked assignment, full-event check-in, group members, status/PDF parity,
  read-only execution and migration replay. SQL ran in disposable PGlite using
  the real export migration plus the new migration and a minimal fixture schema.
  Existing context/organisation resolvers are fixture substitutes; this is not
  evidence that remote assignment configuration or migration state is correct.
- `node tests/team-schedule-popup-browser.cjs`: 18 browser scenarios pass using
  real Schedule/modal/PDF code with fixture-only service/context replacements.
  Widths/orientations: 320×568, 390×844, 844×390, 768×1024, 1024×768, 1366×768.
  Checks include overflow/bounds, long names, pending/export gating, actual PDF
  download, revoked eligibility, retry, empty/error, late-response close, dark
  theme, Escape, assignment/team switch during a pending read or PDF request,
  Full Schedule action and existing My Team Schedule PDF.
  Screenshots and PDF are local ignored artifacts in `.expo/popup-browser`.
- Targeted ESLint and `git diff --check` pass. `npm run build:web` passes.
- Full suite with PGlite available: 118/120 pass. The same two failures reproduce
  on an untouched archive of base `bd9b525`: `group-participation.test.cjs` has a
  VM require stub error; `username-login-errors.test.cjs` lacks an RPC mock.
  Neither existing test nor its implementation was modified for this feature.
- Typecheck has the same 96 errors on the changed tree and untouched base;
  diagnostic comparison found no new errors. Full typecheck is not passing.
- Extracted text from the real downloaded PDF: one page with all 24 fixture
  students and the expected system status labels.
- Target database verification after applying migration `20261025174415`:
  existing export dependency present; both new functions are STABLE with empty
  search paths; PUBLIC/anon execution is denied and authenticated execution is
  granted. The public wrapper is invoker and the private helper is definer.
- Executed the real RPC under the authenticated database role with transaction-local
  claims for 10 existing active Team Leader contexts: 52 returned roster rows
  checked, all matching the resolved team and selected item. Missing identity,
  anonymous execution and unavailable schedule access were denied. Claims and
  role changes were reset; no participant/registration records were modified.
  This verifies database behavior with real context/visibility resolvers, not
  browser login or token handling. PostgREST schema reload was requested.

For verification dependencies, use the declared PGlite dev dependency; this
machine used an ignored `.expo/verification` installation when the shared
node_modules lacked it. Browser runner accepts `PLAYWRIGHT_MODULE` and
`PLAYWRIGHT_CHANNEL` to use an existing installation (tested with headless Edge).
No production test bypasses or fixture routes are included in the application.

## Release boundary

The user authorized committing and pushing only this reviewed feature to target
main, and separately approved the target migration. Two independent read-only
reviewers found no A/B implementation defect. Existing unrelated dirty changes
in the original checkout are excluded. Verify the final remote commit after
push; a Git push alone is not evidence that the frontend deployment has completed.
Missing RPC fails closed with Retry; there is no permission bypass or fallback
to unrestricted tables. A real browser login and physical-device checks remain
unverified; browser automation uses fixture-only context and service replacements.
