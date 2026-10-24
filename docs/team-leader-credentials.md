# Team Leader credential flow

The Team Leader portal uses an existing username and a six-digit numeric password. Leading zeroes are significant. Newly generated usernames remain short opaque `tl…` names; first setup may keep that name or choose another. Admin reset does not rename accounts.

## Data and API flow

- Admin reset → `provision-team-leader` (`reset_password`, REQUIRED) → authenticated admin and visible festival assignment checks → Auth password and setup metadata update → separate username/password response. Participant, registration, result and team rows are not updated by this action. An empty or padded stored username blocks reset before the password changes.
- Login → `resolve-login-identifier` (REQUIRED) → existing service-role username resolver and database rate limiter → Auth password verification → session tokens → `setSession` and profile/access checks (REQUIRED). Username padding is trimmed without changing case. Unknown usernames and wrong passwords share a generic error; network, rate-limit and service failures remain distinguishable.
- First setup → `provision-team-leader` (`self_update_credentials`, CONDITIONAL on setup flags) → exact six ASCII digits validated before profile/Auth changes → setup flags cleared → login with the returned username. If that final login fails, the screen retries login without saving the credentials again and offers a return to Sign In.

## Input and clipboard behavior

Numeric fields accept up to six digits while editing and require exactly six on submit. Surrounding paste whitespace is trimmed; mixed text, internal spaces and overlong values are rejected rather than converted to a different password. Invalid paste blocks submission until corrected. A text-password login fallback remains for existing accounts that have not been reset; setting or resetting a new password through this portal requires six digits.

Admin cards have separate Copy username and Copy password actions. Each copies only its validated value, without surrounding whitespace, labels or a login link. There is no combined-copy action. Temporary passwords remain in page memory; reload requires reissue if they were not handed over.

## Release and regression checks

No SQL/schema migration or Auth settings change is included. Deploy the reviewed frontend and both affected Edge Functions together, then verify one complete reset/login/setup cycle before rotating the remaining approved accounts. Confirm the target project's Auth policy accepts six numeric characters; local `supabase/config.toml` is not proof of hosted Auth settings. Do not relax shared Main Admin Auth policy automatically.

Focused tests cover input/clipboard values, reset authorization and metadata preservation, six-digit setup, username rollback, and username-login error classification. Hosted password policy, real device clipboard/keyboards and live session recovery require deployment verification. No live account reset is performed by implementing these files.
