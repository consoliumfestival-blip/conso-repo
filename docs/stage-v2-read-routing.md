# Stage v2 active read paths

Overview hooks default to summary-only reads when no schedule is selected. Existing pages explicitly selecting v1 continue to support rollback. Check-in, code-letter and other shared consumers with schedule IDs keep the same scoped registration reads and mutation APIs.

The service rejects legacy festival-wide and venue full-payload calls in v2 before sending the heavy request. Migration `20261029035112_stage_v2_legacy_overview_guard.sql` enforces the same rule on both legacy admin registration readers; the with-letters reader delegates to the scoped reader. It also guards the underlying legacy venue endpoint, whose with-letters facade already enforces the mode switch.

The migration preserves deployed bodies, signatures, ACLs and security attributes while injecting guards at checked anchors; unknown function layouts fail the migration instead of replacing the implementation. Reapplication is idempotent. It changes no data records or RLS policies. Existing tenant mode v1 restores the guarded legacy readers; no function deletion is needed. V2 summary/detail endpoints remain independent.

Local tests verify blocked v2 overview reads, allowed schedule detail reads, v1 rollback, migration replay and client routing. After the user applied the migration, a read-only authenticated production check verified the guards, rejected a v2 festival-wide scoped read, and returned schedule-specific rows. Browser/PIN checks remain pending; the read-only check did not modify production data or switch modes.
