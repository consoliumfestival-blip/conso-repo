# Smart Announcer remediation and rollout

Target: `consoliumfestival-blip/conso-repo`; the clone report identifies Supabase project `negkevoetuvuqqlecdno` as the target. Reconfirm identity, deployed schema and migration history before any write. Never modify the source project.

## Observed baseline

- The target currently grants anonymous execution on `get_strategic_publish_order`, `toggle_announcer_result_visibility` and `auto_publish_suspense_batch`; all three are security-definer functions. The token visibility function can change public visibility.
- The target's leaderboard wraps `get_public_leaderboard_unmasked`; projections must use the effective underlying rules, including ranking mode, item limits, grace marks, award ownership and tie breaks.
- `get_admin_published_results` only returns admin-published rows; do not silently redefine the existing filters or change shared consumers.
- Item Results groups and bulk publishes result IDs. Smart Announcer currently writes directly by item ID; retain the existing visibility service and verify the affected IDs before publication.
- The target's `20261110080100_fix_schedule_lock_updated_at` migration is already effective on the target; do not replay it. The wider histories differ: a read-only comparison found ten target-only and 27 repository-only versions, including same-named migrations under different timestamps. This is a target-specific history, as described in `CLONE_SETUP.md`. It does not require replaying or renumbering historical migrations to add a new feature. Use a new reviewed, target-only migration after checking effective schema and dependencies; do not use an automatic push of the repository's historical migration chain.

## Required behavior

- One announcement per item, scoped to tenant and festival. Management selects prepared items and their order; these automatically appear in the announcer queue.
- The announcer portal opens on **To Announce** and offers an **Announced** category. It shows only queued competitions, necessary result details, refresh and an idempotent **Mark Announced** action. Announced items remain visible there after management hides a public result; hiding never schedules re-announcement.
- Announcing does not publish or alter results. Management sees announcement and public-visibility badges and manually publishes through the existing result visibility service.
- Merge Smart Announcer into Leaderboard Management → Item Results. Keep and optimize search, category, individual/group, result-status and visibility filters, switches, preview and single/bulk Publish/Hide. Use a modern responsive layout, compact KPI cards and clear badges; redirect the old admin entry to the merged page.
- Offer **All Results**, **Maintain Suspense** and **Select Team**. List festival teams. For a selected team, prioritize unpublished items awarding it more actual points, showing its item points, projected total and rank. Include the actual points awarded to every other team in the item. Indicate only what a checked sequence proves about reaching first place.
- Golden rule: recommendation modes change only suggested order. Never invent, increase or change marks, awarded points or ranks.

## Implementation sequence

1. Record baseline UI, security and publishing behavior using isolated fixtures. Inventory consumers of the old RPCs and tokens and plan a compatible rollout.
2. Create an item-scoped queue with tenant and festival ownership, stable order and immutable announcement timestamp. Secure management operations with role and ownership checks. Token access must use server-generated high-entropy, expiring, revocable credentials; never expose token listings. Provide restricted token-scoped queue-read and idempotent mark-announced operations.
3. Remove anonymous access to unsafe legacy functions, including the auto-publish path, after providing and testing compatible app changes. Avoid a period where old clients break or retain publish privileges. Review grants and RLS, including PUBLIC inheritance.
4. Implement projections against effective public leaderboard rules and actual awarded points only. Scope tenant/festival/item and prevent double counting. Test both suspense and selected-team ordering, item limits, ties, grace marks, partial visibility and award ownership.
5. Integrate queue and mode controls into Item Results while preserving filters, preview and existing visibility mutations. Update navigation, compact KPI cards and badges. Build a separate announcer portal with pending and announced views; hiding public results must not reset announcement state.
6. Test direct API authorization, expired and revoked tokens, cross-tenant and unqueued access, concurrent actions, announcement/publish/hide transitions and existing dependent workflows, including public leaderboard, poster studio and schedule results. Test desktop and mobile layouts. Prepare rollback and deploy migration and client in a coordinated sequence only after validation. Report implemented changes, tests, migration/deployment status and limitations; claim live verification only if performed.
