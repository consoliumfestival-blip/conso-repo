# Festival read-only portal

An administrator can create or rotate a festival viewer link and PIN from Team Leader Portal settings. The link and PIN grant access to the festival-wide Participants and Programs views; rotating them invalidates the previous link. The PIN stays in memory in the viewer. This access does not grant team-leader or admin permissions.

The `festival_readonly_data` RPC checks the link, PIN, active festival and tenant on every request. It returns essential participant information and non-rejected program assignments only, scoped through the festival's active teams and visible organisations. Participant contact and identity fields are not returned. The portal has no mutation operation. Eight failed PIN attempts within ten minutes temporarily lock the link. Administrator credentials are held in a private schema with no direct anonymous or authenticated access. Administrators should share the link and PIN only with intended viewers.

Programs include active items and inactive items with a non-rejected assignment, matching the existing team portal's visibility behavior. Search and list pagination run in the database. Program and participant detail is fetched on selection.

The Item Results count RPC separately counts distinct core-published items through the existing authorized admin results function; public visibility does not affect this count.

For rollback, first revert the client. Revoke execute on `public.festival_readonly_data(uuid,text,text,text,integer,uuid)` and `public.admin_festival_readonly_portal(uuid,uuid,boolean)` to disable the portal, then drop those functions and the private credentials table/schema only after confirming that existing links may be discarded. Drop `public.admin_core_published_item_count(uuid,uuid)` after reverting the KPI client. Do not roll back unrelated migrations or modify registrations, results, marks or points.
