# College deployment setup

This repository is a standalone application and Supabase schema snapshot. It includes
the app source, Edge Functions, database schema/functions/policies, and fresh
repository-default reference seeds. It does not include production table rows, Auth
users, or Storage objects.

## Run the app

1. Install dependencies with `npm ci`.
2. Copy `.env.example` to `.env.local` and set the new college project's URL and
   publishable key. The anon key is only needed if the app's compatibility fallback
   is used.
3. Start the app with `npm start` (or `npm run web`).

Only public client keys belong in `EXPO_PUBLIC_*`. Keep service-role keys, Supabase
secret keys, database passwords, and provider credentials in server-side secrets.

## Set up Supabase

Create a fresh Supabase project for the college, link the Supabase CLI to that target,
and apply the migrations in `supabase/migrations/`. This folder contains the clean
schema snapshot and repository-default seeds; it deliberately replaces the source
repository's historical migration chain, which is not safe to replay for a fresh
client. Deploy the functions from `supabase/functions/` and configure only the
project-specific secrets required by enabled integrations (for example, R2).

Do not import production database rows, Auth accounts, or Storage objects from the
source project. Create new admin accounts in the new project's Auth system.
