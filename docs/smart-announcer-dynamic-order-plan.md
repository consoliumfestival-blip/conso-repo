# Smart Announcer: dynamic result order implementation plan

## Goal and fixed decisions

- Admin selects **one target team**: the team that should reach and, where feasible, remain in first place. Admin does not select an algorithm mode.
- Implement this as an improvement to the existing Smart Announcer Admin page and queue flow; do not create a second Announcer module or parallel publishing workflow.
- The system recommends the order of eligible, real results. It never edits ranks, grades, marks, `points_awarded`, or public visibility to manufacture suspense.
- **Priority order:** (1) get the selected team to first place as soon as feasible, (2) sustain that lead without unnecessarily opening a large gap, (3) keep the other teams reasonably close for as long as the remaining results allow, (4) allow organic changes of position among the other teams. Rotation is a tie-break preference, never a hard constraint. Do not force one lower team to lead another or require ties.
- If the target cannot reach first place from the available results, show the best attainable position and the reason. Do not claim that the goal was achieved.
- Sending to the announcer, marking announced, and publishing publicly remain separate operations. Public publication must use the existing Item Results visibility flow and its authorization.
- The separate Announcer website supplies visual/interaction reference only; its static data, credentials, and storage are not imported.

## Verified code baseline (target `main` at `ccdbb0f`, 27 Nov 2026)

- `AnnouncerQueue.tsx` already has team selection, up to five suggested items, manual selection/order, Admin-only schedule and projected standings, session creation/closure, and Send to Announcer. The announcer session page has pending/announced views and PIN login.
- `20261125141807_announcer_sequential_team_strategy.sql` scores one selected team, simulates an ordered sequence, and chooses greedily up to five items. Its candidate function requires **positive points for that team**. This can exclude useful results for keeping other teams close and does not optimize the longer remaining sequence.
- `20261125144617_smart_announcer_persistent_sessions.sql` previews and sends batches, locking the active session and rejecting a second batch while one is pending. Existing queue and result rules need inspection against the effective target database before changing SQL.
- The repository code is evidence of intended behavior, not proof that these migrations or the UI are deployed and functioning in production.

## Source of truth and eligibility

1. Map the effective Item Results query and the existing public visibility mutation, including their tenant/festival filters, latest-result selection, rejected registrations, group awards, tie handling, and row-level security. Record which result rows constitute one publishable **item**. Avoid inferring item points from displayed `total_score`.
2. Candidate item: internally published/finalized in Core, available to Leaderboard Management, **not yet public**, not already announced or in the pending queue, and possessing the complete set of result rows required by the existing publish action. Treat partially public items explicitly: use the existing all-or-none publish eligibility rule or exclude them with an actionable reason; never silently recompute only a subset.
3. Use the same canonical result rows and `points_awarded` that Item Results and effective public team standings use. Count group awards once for the owning team; count individual/general awards under their actual team. Apply the existing ranking mode, tie breaks, item limits, grace rules, and award ownership rather than a parallel approximation.
4. Build a focused reconciliation check for each candidate: result IDs, item ID, team ownership, per-team point delta, and sum. If the simulation differs from the Item Results/public standings calculation, exclude that candidate from send and show an Admin error; do not repair points automatically.
5. Read all eligible candidates with bounded pages/batches until exhausted. Stop at the actual row count. Do not silently truncate at an API default limit or fetch an arbitrary 10,000 rows on every UI refresh. Cache the stable result snapshot per festival and invalidate it when relevant result/visibility/queue state changes.

## Recommendation algorithm

1. Baseline = **actual current public team standings** plus any prior queued/announced items only if their public visibility is already reflected. Never add an announced item twice. Rebuild this baseline from current authoritative data after external/manual publishing.
2. For each eligible item, derive a vector of actual point deltas for **all teams**. Simulate adding the item with the effective standings/rank rules, preserving exact ties. Item order changes only the projected sequence, not its point vector.
3. Search for the next batch with a bounded multi-step lookahead (for example, beam search over candidate sequences). Avoid a single greedy first-step choice that harms later suspense. Limit search work adaptively by candidate count, beam width, and time budget; use deterministic tie-breaks. Cache candidate point vectors and baseline standings rather than rerunning the full leaderboard query per candidate per step. The implementation may choose a different bounded search after profiling, provided it preserves the priorities and explains approximation.
4. Compare candidate sequences lexicographically, not by one opaque weighted sum:
   - Prefer sequences that make the selected team first **earlier**, then keep it first at more checkpoints. A tied first follows the effective leaderboard rank rules and must be labelled honestly.
   - Among equally successful sequences, minimize excessive lead and the spread between first and last; also penalize a single large gap between adjacent teams. Evaluate at each announcement checkpoint and the batch end, so a large early gap cannot be hidden by a small final gap.
   - Prefer a sustainable path: estimate whether the remaining available item deltas can continue a close contest after this batch. Do not sacrifice the selected-team first-place goal for this preference.
   - Use organic changes of rank among non-target teams only as a final tie-break. Do not reward artificial oscillation or demand that every team changes place.
5. No fixed 10/15/20-point promises. Show projected spreads and clearly label them as projections from currently available results. When the remaining pool cannot sustain a close contest, show that constraint instead of editing points or inventing an order.
6. Return item IDs, fixed sequence numbers, target-team rank, full projected standings at each step, per-team item point deltas, total spread, and an explanation of why a candidate was chosen. Projection/schedule remain Admin-only; announcer payload contains only the real result details needed to call the item.

## Workflow and recomputation

- Admin selects the target team and sees one automatically ordered recommendation. Manual substitution/reorder is optional, with an updated projection and a visible note that it differs from the recommendation.
- When an item is manually made public elsewhere, hidden, corrected, rejected, or otherwise becomes ineligible, invalidate the snapshot and recompute the **remaining unsent** order from actual standings. Preserve sent/announced history and sequence numbers. Never silently rewrite a batch already sent to the announcer.
- Before Send, server-side validation under the existing tenant/festival/session locks rereads eligibility, result version/visibility, queue state, and the selected order. On drift, reject with a refresh/recalculate response; never send stale or already-public items. Keep the current one-active-session and one-pending-batch rules.
- A new batch is generated only after the pending batch is completed. Announcer marks an item announced idempotently; that action does **not** publish it publicly. The existing Admin publish action remains the only public visibility route.
- Keep a small audit record of suggestion snapshot/version, target team, chosen order, manual substitutions, Send actor/time, and recalculation reason without storing redundant copies of sensitive result data.

## UI

- Use the separate site's compact, responsive card/list pattern within the existing Consolium tokens and navigation. Admin: target-team picker, current public standings, suggested ordered batch, projected checkpoints/spread, substitution search, pending/sent/announced status, and explicit Send. Make stale/invalid states actionable.
- Announcer: numbered results in the exact sent order, clear To Announce and Announced views, readable first/second/third and ties, team/name/chest/code details as supported by the canonical result; no Admin projections or strategy controls.
- Verify narrow phone, phone, tablet, and desktop for clipping, touch targets, loading, empty pool, session closed, and failed save/refresh states.

## Implementation slices for a small agent

1. **Read-only contract audit:** inspect current Item Results, public leaderboard function, result visibility mutation, Smart Announcer RPCs, migrations, effective target schema/history, and direct tests. Produce a short discrepancy table for point ownership and item eligibility. Stop if the canonical points/visibility semantics cannot be established; that is a business/data decision, not a guessed SQL change.
2. **Canonical candidate and point projection:** add the minimal target-only query/function changes needed to use exactly the real result point vectors. Keep existing public API and visibility flow compatible. Add fixtures covering individual, general individual, group, ties, rejected, partial/public, and more than one page of results.
3. **Dynamic ordering:** implement bounded lookahead and deterministic priorities above. Add tests where greedy ordering fails, target reaches first, cannot reach first, lower teams move organically, large early gap is rejected, and no points are altered. Profile with realistic candidate/team counts before selecting search bounds.
4. **Atomic Send/recalculate:** validate under lock at Send; test manual publication between preview and Send, two Admins sending concurrently, repeated Send, and manual substitution. Existing announced history must survive recalculation.
5. **UI and regression:** adapt Admin/Announcer screens using the reference UI, keeping PIN/session, toggle, tenant boundaries, and the existing public publishing route. Verify route-level behavior and responsive layouts. Check public standings, Item Results, and announcement history after each workflow.

## Release gate

- Confirm target repository, branch, clean/dirty state, Supabase project, effective schema, migration history, and applied versions before creating/applying SQL. Do not replay mismatched historical migrations. Review SQL diff and a forward recovery path.
- A passing test means it actually ran against the intended environment. Run focused SQL/logic tests, build/type checks, and relevant browser flows. Compare simulation totals against the existing canonical standings for representative real tenant data **read-only** before deployment.
- Do not push, deploy, publish results, or modify production data merely because this plan exists. Report exact verification and remaining discrepancies before a release decision.
