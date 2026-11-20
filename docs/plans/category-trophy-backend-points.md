# Category Trophy Backend Points Plan

## Summary

Category Trophy points must come from the backend's existing `results.points_awarded` values. The admin standings query currently applies public-result visibility to admin results too, so published but publicly hidden results appear as zero points. This plan separates admin and public visibility while keeping the existing category aggregation and ranking rules.

## Implementation

- Update `_category_trophy_standings` in one additive Supabase migration. Apply `results.public_visible` only for public standings; keep the current published/status checks, deduplication, category mapping, General exclusion, item limit, and tie ordering unchanged.
- Keep the category mode as the sole gate. When disabled, the backend returns no category standings and the UI hides the board. Public standings still require both festival-level public visibility and result-level public visibility.
- Restrict the admin security-definer RPC to Super Admins or the caller's own tenant, and validate that the festival belongs to the requested tenant.
- Keep the UI display-only: render backend `total_points`, add a foreground mode refresh every 15 seconds, and do not add client-side scoring or touch overall leaderboard/result workflows.

## Verification

- With mode enabled, publicly hidden published results contribute to admin category points but not public category points.
- With mode disabled, both standings RPCs return no category rows; open screens hide the board at their next foreground refresh.
- Confirm public visibility, General exclusion, deduplication, existing points, tie order, ordinary overall leaderboard, and publish/hide behavior remain unchanged.
- Apply and verify the migration on the development clone before any production/source rollout.
