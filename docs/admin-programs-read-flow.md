# Admin Programs Page: Read and Layout Flow

## Scope

This flow applies to the Admin **Programs** page. It keeps the existing assignment, group-entry, completion, deselection, and permission workflows while loading list and detail data separately.

## Initial list request

`programs.tsx` calls `admin_program_cards_page` through `programReadService.page`. The database applies search, type, stage, completion, and category filters before applying the fixed 20-card page window. The response also contains the unfiltered section totals, completion total, filter options, and assignment/over-limit summaries for the returned cards.

The phone layout remains one column. Tablet and desktop card widths use a 210px minimum target and the available content width to calculate columns; there is no fixed maximum column count. The 20-card page limit still applies to the result set.

## Detail reads

- Opening an individual program in **View participants** loads that program's assigned participants and registrations.
- Opening it in **Assign participants** loads that program's assigned participants plus category- and gender-eligible participants. The existing registration rule engine and per-participant validation/write path remain in use.
- Opening a group program for assignment loads its eligible participant list. Opening **View participants** loads only that program's team entries and members. Editing a roster loads the selected entry and eligible roster participants.
- Scoped group-entry reads page in batches of 500 so a large selected item is not truncated at the PostgREST row cap. The existing unscoped `generalEntryService.list(festivalId)` behavior remains available to other callers.
- This page has no PDF/CSV export control; no export request is introduced here. The Team Program Progress modal remains its existing separate flow.

## Authorization and tenant boundary

The two new read RPCs are `SECURITY DEFINER` with an empty search path. Each verifies the signed-in profile, admin/superadmin authorization, and that the requested festival belongs to the requested tenant. Item reads are tenant/festival scoped, registrations and participants are restricted to visible organizations and compatible tenant ownership, and anonymous/public execution is revoked. Only `authenticated` receives execute permission.

Group-entry detail still uses the authenticated registrations query and its existing table RLS; the RPC does not replace group create, roster update, or safe-delete RPCs.

## Caching and refresh

Program cards use a two-minute stale window. They do not poll or refresh on focus/reconnect/mount; the **Refresh** button explicitly reloads the current list and any open detail. Cached details are fetched only when opened and refresh on a later open when stale. Code-letter realtime notifications remain subscribed and invalidate the current detail query; they do not reload all festival registrations.

Program create/edit/deactivate and assignment/status/roster changes invalidate the affected Program queries. No schedule, judge, dashboard, or other portal read path is changed.

## Read-path classification

| Read | Classification | When it runs |
| --- | --- | --- |
| `admin_program_cards_page` | REQUIRED | Page load, search/filter/page change, or manual refresh |
| `admin_program_detail` | CONDITIONAL | A program is opened; eligible participants only for assignment/roster editing |
| Scoped group `registrations` query with group members | CONDITIONAL | Group details are opened or a deep-linked group entry is edited |
| Existing per-participant registration lookup in `registerParticipantForItem` | REQUIRED | Individual participant assignment, to preserve duplicate/team/eligibility validation |
| PDF/CSV query | NOT APPLICABLE | No export control exists on this page |

## Database and release notes

Migration `20261031024455_admin_program_reads.sql` adds a private helper schema and two read functions. It does not add or modify table rows, columns, constraints, or indexes. The front end depends on these RPCs, so apply the migration to the intended database before deploying the matching front end. The migration has only been exercised against the local PGlite fixture; no live Supabase project has been changed or verified.

## Known validation boundary

The database fixture covers tenant authorization/isolation, filtering before paging, 20-card windows, completion fallback, group visibility, assignment counts, and selected-program detail scope. Actual phone/tablet/desktop browser rendering and live database query plans still require their respective environments.
