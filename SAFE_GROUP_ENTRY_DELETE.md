# Group entry removal

Implemented locally in `safe_delete_group_entry(uuid)` and Programs → Group →
View participants → Delete entry. A confirmation dialog closes the participant
picker before opening, so the dialogs do not overlap. Individual deselection
continues using its existing API.

The RPC requires an authenticated admin or existing superadmin authority.
Festival ownership and visible-team scope are checked on the server. Only
`general_team` registration rows with no individual participant identity qualify.
It locks the registration and its member participants, checks check-in/code
letters, marks, results, member attendance and certificates, then deletes member
links and the registration together. Unknown foreign-key dependencies roll back
both deletions. An audit snapshot preserves the deleted entry and memberships.

Participants, participant chest numbers, organisations, items and schedules are
not deleted. The existing registration-delete trigger reopens program intake.
Existing history blocks deletion; deleting a group member is still handled by
the roster editor. Query invalidation refreshes the affected membership,
registration, entry-size and intake views after successful removal.

Migration: `supabase/migrations/20261023110000_safe_delete_group_entry.sql`.
The migration has not been applied to the target database or deployed.

Local SQL regression test uses disposable PGlite PostgreSQL with the existing
roster deletion guards loaded from the source-parity migration. Run after
installing `@electric-sql/pglite` in a disposable directory and setting
`PGLITE_MODULE` to that directory's absolute package path:

```text
node --test tests/safe-group-delete.test.cjs
```

Tests cover authorization, cross-tenant denial, every history guard, rollback on
an additional foreign-key dependency, rejection of individual entries, successful
removal with audited members and preserved participants/team/schedule, repeated
calls and anonymous execute permissions. They do not simulate multiple database
connections or prove a deployed browser workflow.
