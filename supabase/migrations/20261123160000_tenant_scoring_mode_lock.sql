BEGIN;

ALTER TABLE public.tenant_feature_settings
  ADD COLUMN IF NOT EXISTS criteria_scoring_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.schedules
  ADD COLUMN IF NOT EXISTS scoring_entry_mode text
  CHECK (scoring_entry_mode IS NULL OR scoring_entry_mode IN ('criteria', 'total_only'));

-- Existing schedules keep the mode already captured by their marks. Mixed
-- historical snapshots are conservatively pinned to total-only.
UPDATE public.schedules s
SET scoring_entry_mode = CASE
  WHEN EXISTS (SELECT 1 FROM public.mark_entries m WHERE m.schedule_id=s.id AND m.entry_mode_snapshot='total_only')
    THEN 'total_only'
  ELSE 'criteria'
END
WHERE s.scoring_entry_mode IS NULL
  AND EXISTS (SELECT 1 FROM public.mark_entries m WHERE m.schedule_id=s.id);

CREATE OR REPLACE FUNCTION public.get_tenant_criteria_scoring(p_tenant_id uuid, p_schedule_id uuid DEFAULT NULL, p_token text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_token IS NOT NULL AND p_schedule_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.judge_tokens jt WHERE jt.schedule_id=p_schedule_id
      AND jt.tenant_id=p_tenant_id AND jt.status='approved' AND jt.is_used=false
      AND jt.is_revoked IS NOT TRUE AND (jt.expires_at IS NULL OR jt.expires_at>now())
      AND (jt.token_hash=encode(extensions.digest(upper(trim(p_token)),'sha256'),'hex')
        OR jt.token=upper(trim(p_token)))) THEN
      RAISE EXCEPTION 'Judge token is invalid.' USING ERRCODE='42501';
    END IF;
  ELSIF auth.uid() IS NULL OR NOT (
    public.is_superadmin() IS TRUE OR EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id=auth.uid()
       AND p.tenant_id=p_tenant_id AND p.role IN ('admin','tenant_admin','festival_admin','judge')
    )
  ) THEN RAISE EXCEPTION 'Tenant scoring settings access required.' USING ERRCODE='42501'; END IF;
  RETURN COALESCE((SELECT criteria_scoring_enabled FROM public.tenant_feature_settings WHERE tenant_id=p_tenant_id), false);
END; $$;

CREATE OR REPLACE FUNCTION public.set_tenant_criteria_scoring(p_tenant_id uuid, p_enabled boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.is_superadmin() IS TRUE OR EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id=auth.uid()
       AND p.tenant_id=p_tenant_id AND p.role IN ('admin','tenant_admin','festival_admin')
    )
  ) THEN RAISE EXCEPTION 'Tenant admin access required.' USING ERRCODE='42501'; END IF;
  UPDATE public.tenant_feature_settings SET criteria_scoring_enabled=p_enabled,
    revision=revision+1, updated_by=auth.uid(), updated_at=now()
  WHERE tenant_id=p_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant settings not found.' USING ERRCODE='P0002'; END IF;
  RETURN p_enabled;
END; $$;

CREATE OR REPLACE FUNCTION public.get_schedule_scoring_mode(p_schedule_id uuid, p_tenant_id uuid, p_token text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_owner uuid; v_mode text;
BEGIN
  SELECT tenant_id, scoring_entry_mode INTO v_owner, v_mode
    FROM public.schedules WHERE id=p_schedule_id;
  IF v_owner IS NULL OR v_owner IS DISTINCT FROM p_tenant_id THEN
    RAISE EXCEPTION 'Schedule access denied.' USING ERRCODE='42501';
  END IF;
  IF p_token IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.judge_tokens jt
      WHERE jt.schedule_id=p_schedule_id AND jt.tenant_id=v_owner
        AND jt.status='approved' AND jt.is_used=false AND jt.is_revoked IS NOT TRUE
        AND (jt.expires_at IS NULL OR jt.expires_at>now())
        AND (jt.token_hash=encode(extensions.digest(upper(trim(p_token)),'sha256'),'hex')
          OR jt.token=upper(trim(p_token)))) THEN
      RAISE EXCEPTION 'Judge token is invalid.' USING ERRCODE='42501';
    END IF;
  ELSIF auth.uid() IS NULL OR NOT (public.is_superadmin() IS TRUE OR EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.tenant_id=v_owner
      AND p.role IN ('admin','tenant_admin','festival_admin')
  )) THEN
    RAISE EXCEPTION 'Tenant admin access required.' USING ERRCODE='42501';
  END IF;
  RETURN v_mode;
END; $$;

CREATE OR REPLACE FUNCTION public.lock_schedule_scoring_mode()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_tenant uuid; v_mode text; v_enabled boolean;
BEGIN
  SELECT tenant_id, scoring_entry_mode INTO v_tenant, v_mode
  FROM public.schedules WHERE id=NEW.schedule_id FOR UPDATE;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Schedule not found.'; END IF;
  IF v_mode IS NULL THEN
    SELECT COALESCE(criteria_scoring_enabled,false) INTO v_enabled
      FROM public.tenant_feature_settings WHERE tenant_id=v_tenant;
    v_mode := CASE WHEN COALESCE(v_enabled,false) AND NEW.entry_mode_snapshot='criteria'
      THEN 'criteria' ELSE 'total_only' END;
    UPDATE public.schedules SET scoring_entry_mode=v_mode WHERE id=NEW.schedule_id;
  END IF;
  IF NEW.entry_mode_snapshot IS DISTINCT FROM v_mode THEN
    RAISE EXCEPTION 'Scoring mode changed. Reload this competition before saving marks.';
  END IF;
  IF v_mode='total_only' AND (NEW.max_mark_snapshot IS DISTINCT FROM 100
    OR COALESCE(NEW.criteria_scores,'{}'::jsonb) <> '{}'::jsonb
    OR COALESCE(NEW.criteria_snapshot,'[]'::jsonb) <> '[]'::jsonb) THEN
    RAISE EXCEPTION 'Total-only scoring requires one mark out of 100. Reload this competition.';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS a_lock_schedule_scoring_mode ON public.mark_entries;
CREATE TRIGGER a_lock_schedule_scoring_mode BEFORE INSERT OR UPDATE ON public.mark_entries
FOR EACH ROW EXECUTE FUNCTION public.lock_schedule_scoring_mode();

REVOKE ALL ON FUNCTION public.get_tenant_criteria_scoring(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tenant_criteria_scoring(uuid, uuid, text) TO authenticated, anon;
REVOKE ALL ON FUNCTION public.set_tenant_criteria_scoring(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_tenant_criteria_scoring(uuid, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.get_schedule_scoring_mode(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_schedule_scoring_mode(uuid, uuid, text) TO authenticated, anon;
REVOKE ALL ON FUNCTION public.lock_schedule_scoring_mode() FROM PUBLIC, anon, authenticated;

COMMIT;
