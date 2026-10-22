# College deployment setup

This repository contains the application, Edge Functions, and migration history for
the existing target clone. The 2026-10-22 update synchronizes current application
structure/functions without importing source business rows, Auth users, uploaded
objects, or points-configuration records. See `CLONE_UPDATE_REPORT.md` for evidence
and remaining runtime limitations.

## Run the app

1. Install dependencies with `npm ci`.
2. Copy `.env.example` to `.env.local` and set the new college project's URL and
   publishable key. The anon key is only needed if the app's compatibility fallback
   is used.
3. Start the app with `npm start` (or `npm run web`).

Only public client keys belong in `EXPO_PUBLIC_*`. Keep service-role keys, Supabase
secret keys, database passwords, and provider credentials in server-side secrets.

## Set up Supabase

The current target is already migrated. Do not replay historical seed migrations
for this update. The original clone history contains default reference seed files;
they are preserved as applied history, not instructions to add data again. A future
fresh, empty installation needs a separately reviewed schema-only bootstrap that
omits those seed operations. Do not replay the source repository's legacy migration
chain against this target.

The read-only catalog and parity scripts require an ignored management ENV based on
`.env.clone.example`. They query source metadata only. The target-only migration
executor validates project identity, checks snapshot fingerprints and preserves row
counts. Its default `--mode=check` ends in ROLLBACK; persistent changes require the
explicit `--mode=apply` and a versioned target migration path.

Function JWT settings are declared in `supabase/config.toml`. Only the pre-login
resolver disables gateway JWT verification; its handler validates credentials and
rate-limits login attempts. Do not blanket-disable JWT verification for other functions.

R2 setup is deferred until target credentials are available. Set server fields from
`supabase/functions/.env.example` in the ignored management ENV, then use
`node scripts/configure-clone-r2-secrets.cjs --env=<ignored-env-path>`. The script
refuses to overwrite existing secrets. Set matching public bucket/domain values in
the frontend environment and configure bucket CORS before upload testing. No source
R2 objects are to be transferred.

Do not import production database rows, Auth accounts, or Storage objects from the
source project. Create new admin accounts in the new project's Auth system.
