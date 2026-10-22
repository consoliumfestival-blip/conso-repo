-- Group entries use the selected participant's existing chest number.
-- Keep entry_chest_number as a legacy compatibility field, but retire the
-- private allocator and its cross-table collision guard.
BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.registrations
    WHERE entry_kind = 'general_team'
      AND entry_chest_number IS NOT NULL
  ) THEN
    RAISE EXCEPTION
      'Cannot remove the group chest allocator while legacy numbered group entries exist.'
      USING ERRCODE = '55000';
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS group_entry_participant_chest_guard ON public.participants;
DROP FUNCTION IF EXISTS group_entry_private.guard_participant_chest();
DROP FUNCTION IF EXISTS group_entry_private.allocate_chest(uuid);
DROP INDEX IF EXISTS public.registrations_general_entry_chest_unique;
DROP TABLE IF EXISTS public.general_entry_number_counters;

COMMIT;
