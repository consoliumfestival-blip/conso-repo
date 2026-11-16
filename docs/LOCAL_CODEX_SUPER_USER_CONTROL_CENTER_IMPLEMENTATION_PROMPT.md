# Local Codex Implementation Prompt: Super User Control Center

Copy the prompt below into Local Codex. It instructs Codex to inspect the
current checkout, complete any missing implementation work, and verify it
against the local test guide.

## Prompt

```text
Implement and verify the Super User Tenant Control Center in this repository.

First inspect AGENTS.md, git status, the current branch, and these documents:
- docs/SUPER_USER_CONTROL_CENTER_GOAL.md
- docs/LOCAL_CODEX_SUPER_USER_CONTROL_CENTER_TEST_GUIDE.md

Inspect the existing implementation before editing. Some or all of this work
may already be present. Do not duplicate it or overwrite unrelated local edits.
Compare the code and migrations with the goal and acceptance checks, then make
only the changes needed to complete the feature safely.

Feature requirements:
1. Provide a responsive Super User tenant control page that matches the
   existing Super User UI. Keep the existing Admin controls available during
   this rollout.
2. Let a Super User edit tenant/account name, root organisation name, festival
   display name, and the English and Malayalam talent/item names. Keep updates
   tenant/festival scoped, validate input, detect stale edits, and record an
   audit entry.
3. Let a Super User control Team Leader Management, Team Leader Portal, Smart
   Announcer, Stage Management, Judge Portal, Direct Entry, Public Page, Public
   Leaderboard, Poster Studio, and Media Center. Include the Team Leader and
   Public Page subsection switches described in the goal document.
4. Keep every module and subsection enabled by default for existing and new
   tenants. When Team Leader Management is disabled, disable its portal too;
   turning management back on must not silently re-enable that portal.
5. Enforce module and subsection settings in navigation, protected routes,
   database RPCs, tokens/PIN flows, and relevant RLS policies. Hiding a menu
   item alone is not sufficient. Keep Direct Entry and Judge Portal as
   independent result-publishing modes.
6. Provide Super User chest-number controls for the selected festival: Team or
   Category template, supported range, team/category ordering, final lock,
   regenerate, and tenant-ID unlock. Confirm any operation that can reassign
   participant numbers, use revision/conflict checks, preserve tenant scope,
   and write audit history.
7. Provide useful loading, retry, empty, conflict, and error states. Verify the
   layout at phone and desktop widths.

Safety requirements:
- Work only against a disposable local Supabase stack. Production control
  center migration has not been deployed; do not connect to or query production.
- Before starting the app, verify EXPO_PUBLIC_SUPABASE_URL in .env.local is
  localhost or 127.0.0.1. Print only the host during this check and never print
  keys or other environment values.
- Use synthetic tenants, festivals, users, and participant data. Do not copy
  production data, Auth users, or tokens.
- Use `supabase start` and `supabase db reset --local` only after confirming
  the local target. Never use `--linked`, `db push`, remote SQL tools, or a
  production migration/deploy command.
- Do not commit or push changes as part of this task.
- If the local migration chain fails on a fresh database, stop at the first
  failure and report it. Do not bypass it by using a remote project or rewriting
  historical migrations.

Verification:
- Follow every applicable check in
  docs/LOCAL_CODEX_SUPER_USER_CONTROL_CENTER_TEST_GUIDE.md, including direct
  backend authorization and tenant-isolation checks.
- Add focused automated coverage for gaps, following existing repository test
  conventions. Run targeted tests, `git diff --check`, `npm run build:web`, and
  `npm run lint`. Do not report checks as passing unless they were run.
- Separate existing unrelated lint/type/build failures from regressions caused
  by this implementation, with file and line evidence.
- After testing, reset only the disposable local database if needed to remove
  synthetic fixtures.

Finish with a concise report listing files changed, local commands and tests
run, PASS/FAIL/BLOCKED results for the acceptance checks, and any issue that
still prevents safe production deployment. Do not deploy or push.
```
