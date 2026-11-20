BEGIN;

-- Remove the super-admin Tenant Control item-name read/edit RPCs. Existing
-- item names and audit history are retained; only this control-center path is
-- removed. Festival display-name editing remains available.
DROP FUNCTION IF EXISTS public.super_update_talent_name(uuid, uuid, uuid, text, text, text, text);
DROP FUNCTION IF EXISTS public.super_get_tenant_talents(uuid, uuid);

NOTIFY pgrst, 'reload schema';
COMMIT;
