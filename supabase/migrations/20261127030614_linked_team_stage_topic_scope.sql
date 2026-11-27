BEGIN;

-- Display ownership follows the festival's linked teams, without reassigning
-- registrations or changing the stage caller's existing authorization.
CREATE OR REPLACE FUNCTION private.stage_topic_registration_in_scope(
  p_registration public.registrations, p_schedule public.schedules
)
RETURNS boolean LANGUAGE sql STABLE SET search_path = ''
AS $function$
  SELECT COALESCE(
    (p_registration).festival_id = (p_schedule).festival_id
    AND (p_registration).item_id = (p_schedule).item_id
    AND (p_registration).status IS DISTINCT FROM 'rejected'
    AND (
      (p_registration).tenant_id = (p_schedule).tenant_id
      OR EXISTS (
        SELECT 1 FROM public.festival_teams ft
        JOIN public.get_visible_organisations((p_schedule).tenant_id) visible
          ON visible.id = ft.organisation_id
        WHERE ft.parent_tenant_id = (p_schedule).tenant_id
          AND ft.festival_id = (p_schedule).festival_id
          AND visible.tenant_id = (p_registration).tenant_id
          AND visible.id = COALESCE((p_registration).organisation_id, (
            SELECT participant.organisation_id FROM public.participants participant
            WHERE participant.id = (p_registration).participant_id
              AND participant.festival_id = (p_schedule).festival_id
              AND participant.tenant_id = (p_registration).tenant_id
          ))
      )
    ), false);
$function$;
REVOKE ALL ON FUNCTION private.stage_topic_registration_in_scope(public.registrations,public.schedules)
  FROM PUBLIC, anon, authenticated;

-- Preserve deployed authorization, locks, preview guards and grants. Exact
-- anchors/counts make unexpected deployed definition drift fail atomically.
DO $migration$
DECLARE
  v_function regprocedure;
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  FOREACH v_function IN ARRAY ARRAY[
    'private.enqueue_stage_topic_draw(uuid,uuid,uuid)'::regprocedure,
    'private.publish_saved_stage_draw(uuid,bigint,uuid,uuid,uuid,text,text,text,integer)'::regprocedure,
    'public.admin_stage_topic_display_state(uuid)'::regprocedure,
    'public.stage_portal_topic_display_state(uuid)'::regprocedure,
    'public.admin_stage_topic_show_selected(uuid,bigint,uuid,uuid,uuid,uuid,text,text,text)'::regprocedure,
    'public.stage_portal_topic_show_selected(uuid,bigint,uuid,uuid,uuid,uuid,text,text,text)'::regprocedure
  ] LOOP
    v_definition := replace(pg_get_functiondef(v_function), chr(13), '');
    IF v_function = 'private.enqueue_stage_topic_draw(uuid,uuid,uuid)'::regprocedure THEN
      v_old := $anchor$WHERE id = p_registration_id AND tenant_id = v_schedule.tenant_id
      AND festival_id = v_schedule.festival_id AND item_id = v_schedule.item_id
      AND status IS DISTINCT FROM 'rejected'$anchor$;
      v_new := $anchor$WHERE id = p_registration_id
      AND private.stage_topic_registration_in_scope(registrations, v_schedule)$anchor$;
    ELSIF v_function = 'private.publish_saved_stage_draw(uuid,bigint,uuid,uuid,uuid,text,text,text,integer)'::regprocedure THEN
      v_old := $anchor$IF v_registration.tenant_id IS DISTINCT FROM v_schedule.tenant_id THEN
    RAISE EXCEPTION 'Registration ownership does not match this event. Ask an administrator to verify the registration tenant before displaying this draw.' USING ERRCODE = '42501';
  END IF;$anchor$;
      v_new := $anchor$IF NOT private.stage_topic_registration_in_scope(v_registration, v_schedule) THEN
    RAISE EXCEPTION 'The selected registration is outside this festival team or event. Refresh the selection; ask an administrator to verify its festival-team link.' USING ERRCODE = '42501';
  END IF;$anchor$;
    ELSE
      v_old := 'AND r.tenant_id = q.tenant_id AND r.festival_id = q.festival_id';
      v_new := 'AND private.stage_topic_registration_in_scope(r, s)
        AND r.festival_id = q.festival_id';
    END IF;
    v_old := replace(v_old, chr(13), '');
    v_new := replace(v_new, chr(13), '');
    IF (length(v_definition) - length(replace(v_definition, v_old, ''))) / length(v_old) <> 1 THEN
      RAISE EXCEPTION 'Unexpected Topic function definition: %. No changes applied.', v_function;
    END IF;
    v_definition := replace(v_definition, v_old, v_new);
    IF v_function IN (
      'public.admin_stage_topic_show_selected(uuid,bigint,uuid,uuid,uuid,uuid,text,text,text)'::regprocedure,
      'public.stage_portal_topic_show_selected(uuid,bigint,uuid,uuid,uuid,uuid,text,text,text)'::regprocedure
    ) THEN
      v_old := 'AND r.tenant_id = v_schedule.tenant_id AND r.festival_id = v_schedule.festival_id';
      v_new := 'AND private.stage_topic_registration_in_scope(r, v_schedule)
    AND r.festival_id = v_schedule.festival_id';
      v_old := replace(v_old, chr(13), '');
      v_new := replace(v_new, chr(13), '');
      IF (length(v_definition) - length(replace(v_definition, v_old, ''))) / length(v_old) <> 1 THEN
        RAISE EXCEPTION 'Unexpected Topic selection definition: %. No changes applied.', v_function;
      END IF;
      v_definition := replace(v_definition, v_old, v_new);
    END IF;
    EXECUTE v_definition;
  END LOOP;
END;
$migration$;

NOTIFY pgrst, 'reload schema';
COMMIT;
