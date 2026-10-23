-- The schedule creation flow and bulk_create_schedules RPC already enforce
-- one schedule per competition and festival. This index makes that invariant
-- atomic for concurrent requests and direct authenticated inserts as well.
-- safe_delete_schedule removes a schedule only after dependency checks, so a
-- successfully deleted item can be scheduled again.
DO $migration_check$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.schedules
    WHERE festival_id IS NOT NULL
      AND item_id IS NOT NULL
    GROUP BY festival_id, item_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot enforce one schedule per festival item: duplicate schedules already exist. Review and resolve those rows before applying this migration.';
  END IF;
END;
$migration_check$;

CREATE UNIQUE INDEX IF NOT EXISTS schedules_one_item_per_festival_uidx
  ON public.schedules (festival_id, item_id)
  WHERE festival_id IS NOT NULL AND item_id IS NOT NULL;
