# Admin production code-release push

This feature sends one Web Push notification to each opted-in Admin PWA device
after a **successful production deployment** of the Cloudflare Pages project.
It does not observe database writes, marks, schedules, or any other application
data changes. The existing `PwaUpdateNotice` remains the in-app update/reload
prompt.

## Flow

1. An Admin opens the portal and opts in through the Admin-only prompt. The
   browser asks for OS notification permission only after the Enable button is
   pressed.
2. The browser stores its Push API subscription in
   `public.admin_web_push_subscriptions`, scoped to the authenticated Admin and
   tenant. RLS prevents other users from adding, reading, or removing it.
3. Cloudflare Platform Notifications sends a webhook for the configured Pages
   production deployment-success policy to the release Worker.
4. The Worker checks Cloudflare's `cf-webhook-auth` secret, account ID and
   policy ID, claims an idempotency key in `admin_code_release_events`, and
   sends a generic release message to the opted-in Admin subscriptions whose
   current profile is still Admin and has `notification_enabled` enabled.
5. Expired browser subscriptions (HTTP 404/410) are deleted. Temporary delivery
   failures release the event claim for retry.

The release message contains no tenant or participant data. It uses the same
notification tag on retries so a retry replaces the previous OS notification
instead of stacking duplicates.

## Configuration required outside Git

These steps are **not performed by a repository change**. Do not put secret
values in Git, the browser bundle, or `EXPO_PUBLIC_*` variables.

1. Apply the reviewed migration
   `20261120145530_admin_code_release_push.sql` to the verified target Supabase
   project. It creates only the Admin push subscription and release-event
   tables plus service-role-only release claim functions.
2. In `cloudflare/admin-code-release-push`, run `npm ci`, then deploy the
   Worker with `npx wrangler deploy`.
3. Set these Worker secrets with Wrangler or Cloudflare Workers & Pages settings:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `CF_WEBHOOK_SECRET`
   - `CF_ACCOUNT_ID`
   - `CF_POLICY_ID`
   - `VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
   - `VAPID_SUBJECT` (a `mailto:` contact)
4. Generate a VAPID key pair locally using the `web-push` CLI. Keep the private
   key only in the Worker secret. Set the matching public key in the Cloudflare
   Pages **Production build** variable
   `EXPO_PUBLIC_ADMIN_WEB_PUSH_VAPID_PUBLIC_KEY`, then trigger a Pages build.
   The public key is safe to include in the browser bundle.
5. In Cloudflare, create a generic webhook destination. Use the Worker URL
   `https://<worker-host>/cloudflare-pages-release` and set its webhook secret
   to the same `CF_WEBHOOK_SECRET` Worker secret.
6. Create a **Project updates** notification policy filtered to the Consolium
   Pages project, **Production**, and **Deployment success** only. Select the
   generic webhook destination. Set the resulting Cloudflare account ID and
   policy ID as the matching Worker secrets.
7. Test the destination from Cloudflare, then verify one successful production
   deployment reaches an opted-in Admin device. Preview deployments and failed
   builds must not match the policy.

Cloudflare documents production/preview deployment-success alert filters and
generic webhook authentication via `cf-webhook-auth` in its [Platform
Notifications](https://developers.cloudflare.com/notifications/notification-available/),
[webhook setup](https://developers.cloudflare.com/notifications/get-started/configure-webhooks/),
and [webhook payload](https://developers.cloudflare.com/notifications/reference/webhook-payload-schema/)
guides.

## Rollback

1. Disable or delete the Cloudflare Pages notification policy first.
2. Remove the Worker deployment or its webhook/VAPID/Supabase secrets.
3. Revert the frontend prompt and migration only after confirming that saved
   subscriptions and release history can be discarded. Existing PWA update
   detection remains independent.

The migration and Worker are prepared in source only. Their production
configuration and deployment must be separately verified.
