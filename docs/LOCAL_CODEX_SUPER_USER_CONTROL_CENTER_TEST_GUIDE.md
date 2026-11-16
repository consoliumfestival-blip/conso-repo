# Local Codex Test Guide: Super User Control Center

## Task

Test the Super User tenant control center on a disposable local Supabase stack.
Find and fix implementation defects that block the acceptance checks below, then
report the commands run and any checks that could not be completed.

The implementation under test is in `src/app/(super)/tenant-settings.tsx`,
`src/core/hooks/useTenantFeatures.ts`, related portal guards, and the migrations
`20261116065237_super_tenant_name.sql` and
`20261116070416_super_tenant_control_center.sql`.

## Safety boundary

- Use only the local Supabase stack at `localhost` or `127.0.0.1`.
- Do not use a linked Supabase project, production URL, MCP database tools,
  `supabase db push`, or any `--linked` command.
- Before opening the app, verify that `EXPO_PUBLIC_SUPABASE_URL` in
  `.env.local` points to `http://127.0.0.1:54321` or `http://localhost:54321`.
  Print only the host while checking it; do not print environment values or keys.
- Never put a service-role or secret key in an `EXPO_PUBLIC_*` variable. Use
  local-only Auth users and synthetic fixture data. Do not copy production data,
  Auth users, tokens, or participant details.
- `supabase/seed.sql` is intentionally schema-only. Create disposable local
  fixtures for the test and remove them with a local database reset afterward.
- The production control-center migration has not been deployed. Test the local
  migration files in this repository; do not use production as a test target.

If the local database reset fails because the historical migration chain cannot
rebuild a fresh database, stop and report the first failing migration. Do not
edit historical migrations or point the test at a remote project to get past it.

## Local setup

1. Read the repository `AGENTS.md` and the current diff before changing files.
2. Start Docker and the local Supabase stack:

   ```sh
   npx supabase start
   npx supabase db reset --local
   npx supabase migration list --local
   ```

   The reset is destructive to the **local** database. Confirm the local URL
   safety check above before running it. It should apply both control-center
   migrations.

3. Configure `.env.local` with the local API URL and the local publishable/anon
   key. Keep the key in the ignored local file; never include it in logs or the
   report.
4. Create disposable local Auth users for a Super User, a tenant administrator
   for Tenant A, and a tenant administrator for Tenant B. Link each user to a
   matching local `profiles` row. Create synthetic tenants, root organisations,
   festivals, items, teams, and results for both tenants. Use the repository's
   actual schema and existing fixture conventions.
5. Start the app with `npm run web`. Use the Super User tenant list to open the
   new settings page. Test at a phone viewport (about 390 px wide) and desktop
   viewport (about 1365 px wide).

Do not hard-code test credentials in tracked files. If fixture SQL or test code
is added, keep it clearly marked as local-only and make cleanup/reset steps
explicit.

## Acceptance checks

### Tenant identity and names

- [ ] A Super User can open a tenant's control center from the tenant list.
- [ ] Tenant/account name and root organisation name save, reload, and display
      in the appropriate tenant list or header.
- [ ] Festival display name saves for the selected festival only.
- [ ] Talent/item English and Malayalam names save for the selected item only.
- [ ] Blank or overlong names are rejected with a useful message.
- [ ] A stale expected value produces a conflict error instead of overwriting a
      newer name.
- [ ] Every successful name change appears in the Super User audit history.

### Module and section switches

- [ ] A new tenant starts with every module and section enabled. Existing Admin
      controls remain available while Super User controls are introduced.
- [ ] The page exposes switches for Team Leader Management, Team Leader Portal,
      Smart Announcer, Stage Management, Judge Portal, Direct Entry, Public Page,
      Public Leaderboard, Poster Studio, and Media Center.
- [ ] Team Leader sections cover My Team, Schedule, Results, Participants,
      Programs, and Announcements. Public Page sections cover Schedule, Results
      and Rankings, Participant Results, and Media.
- [ ] Changing switches does not persist until Save is used. After saving,
      refreshing, and reopening the page, values and revision remain correct.
- [ ] Turning Team Leader Management off also turns the Team Leader Portal off.
      Turning management back on does not silently turn the portal back on.
- [ ] A stale settings revision is rejected; the UI reloads the latest values
      and does not overwrite another update.
- [ ] Successful switch changes appear in audit history.

### Portal and API enforcement

Test the visible navigation and directly open a protected route for each
disabled module. A hidden menu alone does not pass; backend access must also be
checked through its relevant RPC or policy.

- [ ] Team Leader Management off hides its Admin entry and blocks assignment or
      provisioning operations. Team Leader Portal off blocks its portal pages
      and section data.
- [ ] Each Team Leader subsection is inaccessible when its section is off.
- [ ] Smart Announcer off blocks its tenant admin and token/PIN access paths.
- [ ] Stage Management off blocks its tenant stage operations and portal PIN
      access.
- [ ] Judge Portal off blocks judge token/login/scoring and mark submission.
- [ ] Direct Entry off rejects manual result publication. With Direct Entry on
      and Judge Portal off, direct publication remains available; the two modes
      are controlled independently.
- [ ] Public Page off blocks public schedule/results/media data. Public Page
      section switches block their matching public endpoints and screens.
- [ ] Public Leaderboard off blocks leaderboard results while preserving other
      enabled Public Page sections.
- [ ] Poster Studio and Media Center off block their tenant-owned data through
      RLS/policies as well as hiding their navigation entries.
- [ ] Re-enabling a module restores access after a fresh query/session refresh.

### Tenant isolation and authorization

- [ ] Tenant A's Super User settings never expose or change Tenant B's names,
      festivals, talents, chest settings, modules, or audit records.
- [ ] Passing Tenant B's festival/item IDs with Tenant A's tenant ID is rejected
      by the database RPCs.
- [ ] Tenant administrators cannot call Super User mutation/list RPCs for
      another tenant. Unauthenticated and anonymous callers cannot perform
      Super User mutations.
- [ ] The `tenant_feature_settings` table is not directly readable or writable
      by `anon` or `authenticated`; access goes through the intended RPCs.
- [ ] Public feature settings expose only the public-safe module/section values.

### Chest-number controls

Use synthetic participants only. Chest-number operations can reassign existing
numbers, so verify the fixture before and after each change.

- [ ] The Super User can select a festival and see its current template, range,
      team order, category order, lock state, and revision.
- [ ] Team and Category templates save. The 1000 range is available only for
      Team template; Category template uses the 100 range.
- [ ] Reordering teams/categories changes the preview only until saved. Saving
      requires confirmation and updates only the selected festival's synthetic
      participant numbers.
- [ ] Regenerate requires confirmation and affects only the selected fixture
      festival.
- [ ] Locking requires confirmation and prevents saving order/template changes
      and regeneration.
- [ ] Unlock with an incorrect tenant ID fails. Unlock with the exact current
      tenant ID succeeds and preserves the existing order and numbers.
- [ ] Lock/unlock and successful numbering changes appear in audit history.
- [ ] A stale revision or changed team list is rejected without partial writes.

### Responsive UI and regressions

- [ ] At phone width, inputs, switches, confirmation prompts, festival choices,
      chest controls, and audit rows fit without horizontal overflow.
- [ ] At desktop width, sections are readable and controls remain aligned.
- [ ] Loading, missing tenant ID, missing data, RPC errors, and retry states are
      understandable and do not leave the page stuck in a busy state.
- [ ] Existing Admin settings remain visible and usable; do not remove or
      silently change their behavior in this verification pass.

## Automated checks

There is no general `npm test` script. Inspect `package.json` and the existing
test conventions, add focused coverage for uncovered failures, then run the
targeted checks. At minimum, report results for:

```sh
git diff --check
npm run build:web
npm run lint
```

Run relevant test files with the repository's existing test runner. Do not
claim success for a test that was not run. Separate pre-existing unrelated
failures from failures introduced by this feature, with file and line evidence.

For SQL/RPC checks, use the disposable local database and synthetic identities.
Prefer rollback-safe fixtures or reset the local DB after testing. Verify the
new migration completed and the expected functions/policies exist before
running UI checks.

## Report format

Return a short report with:

1. Local environment used and confirmation that the Supabase host was local.
2. Commands and targeted test files run, with pass/fail results.
3. Acceptance checks that passed, failed, or were blocked.
4. Any implementation changes made, with file paths and reasons.
5. Any remaining issue that prevents safe production deployment.

Do not push to GitHub or deploy SQL/functions as part of this local test task.
