-- Run only after the PIN-aware client is live and verified against the target.
-- Existing legacy links remain usable until their own expiry or revocation.
-- Stops older admin clients issuing new links without a PIN.
REVOKE EXECUTE ON FUNCTION public.smart_announcer_issue_token(uuid, uuid) FROM PUBLIC, anon, authenticated;
