# Admin Schedule overview optimization

Local implementation, 2026-10-29. Not deployed; migration not applied by this task.

## Verified source behavior
The list previously mounted useParticipants (full list), festival registrations (500-row cursor batches), unused useJudges list, festival results, and tenant judge management status. Each workflow badge loaded a submission summary, mark entries (including assignments), and results (including schedule scope), with independent polling. Generic schedules also enriched judge assignments unnecessarily for this list.

## Current read flow
Schedule list opts into useSchedule({overview:true}). It retains existing mutations and venues, and reads only Schedule UI/PDF display columns without assignment enrichment. Workflow is one authenticated user/tenant/festival cache scope, one RPC, every 30 seconds while the screen is focused. React Query serializes the query; background tabs do not poll. A failed refresh retains cached data and shows a retry message. Missing summaries are unavailable, not fabricated zeros; workflow filters do not treat missing summaries as completed/pending. No previous-festival placeholder is used.

RPC admin_schedule_workflow_overview(uuid,uuid) is STABLE SECURITY INVOKER, checks caller tenant/superadmin and visible festival, and returns only selected tenant/festival schedule summaries. Existing table RLS is unchanged; EXECUTE is authenticated only. Registration counts use the same item + festival match and rejected exclusion as the old list. Badges retain shuffle-lock overrides; filters deliberately retain their old lack of lock overrides. Coded count includes empty non-null letters, while judge completion requires truthy/nonempty letters, matching old JavaScript.

Marks filter has a different eligibility/completion definition from badges. The aggregate deliberately invokes existing get_judge_management_status once and joins its output to visible schedules, retaining its existing SECURITY DEFINER implementation and tenant-level calculation. This is an explicitly retained performance limitation: the RPC does not make that internal calculation festival-only or alter its historical item-based matching. Further replacing that contract requires separate parity evidence; this change does not claim every database scan is festival-only.

PDF handlers load registrations, participants and the existing generator only on click, preserve selected schedules and filters and existing layout. Export lock prevents concurrent clicks. Blank PDF loads only its generator and existing item metadata. Export failures do not fail Schedule rendering.

## Compatibility and release
No domain writes, backfills, indexes, policy edits or statement-timeout changes. Shared judge/participant/stage operational APIs remain intact. Existing schedules-prefix mutation invalidation also invalidates overview summaries. Other useSchedule callers retain their original cache key and read contract.

Apply supabase/migrations/20261029050321_admin_schedule_workflow_overview.sql before deploying the frontend. No automatic legacy-query fallback is provided: a missing RPC shows workflow unavailable rather than silently launching old N+1 reads.

## Validation and boundaries
node --test tests/schedule-overview.test.cjs checks actual PGlite aggregate execution, counts, empty schedules, canonical marks parity, published/manual results, tenant/festival/RLS isolation, anon denial and absence of old page hook paths. Targeted ESLint and web build pass. Full TypeScript has unrelated pre-existing failures; changed files have no diagnostics in the captured run.
Production timing/EXPLAIN, actual browser request tracing, multi-device behavior, physical viewport QA, and PDF download/CRUD end-to-end remain unverified. Source preservation and fixture tests do not prove those runtime workflows.
