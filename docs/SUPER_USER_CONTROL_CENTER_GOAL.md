# Super User Control Center Goal

## Goal

Give Super Users a tenant-scoped control center for account identity, portal and
section access, festival and talent names, and chest-number configuration. Keep
existing tenant defaults enabled and preserve the current Admin controls while
the new Super User controls are introduced.

## Implementation plan

- [x] Add a responsive Super User tenant settings page and tenant-list entry.
- [x] Add audited, tenant-scoped RPCs for account, organisation, festival, and
  talent names; module switches; chest settings; and change history.
- [x] Add tenant feature switches for Team Leader Management and Portal, Smart
  Announcer, Stage Management, Judge Portal, Direct Entry, Public Page,
  leaderboard, Poster Studio, and Media Center.
- [x] Add Team Leader and Public Page section switches, including participant
  results and media.
- [x] Enforce switches at application routes and relevant database APIs; keep
  public reads tenant-scoped and disable existing token or PIN portal access
  when its module is off.
- [x] Add conflict checks, confirmed chest-number changes, tenant-ID unlock,
  and audit history.
- [ ] Apply the new migrations to the target Supabase environment and verify
  the controls against a staging tenant.

## Delivery notes

The implementation is in the application and Supabase migration files. Tenant
defaults remain enabled, so applying the feature-settings migration does not
turn off existing portals. Production behavior changes only after the
migrations are applied. Run the staging verification before applying them to
production.
