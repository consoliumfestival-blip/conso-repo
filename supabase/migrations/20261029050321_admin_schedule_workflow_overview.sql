-- Additive read-only overview; no domain data, permissions or shared workflows changed.
CREATE OR REPLACE FUNCTION public.admin_schedule_workflow_overview(p_tenant_id uuid,p_festival_id uuid)
RETURNS TABLE(schedule_id uuid,active_count bigint,verified_count bigint,coded_count bigint,rejected_count bigint,
assigned_judges bigint,submitted_judges bigint,marks_completed boolean,has_manual_result boolean,has_published_result boolean)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR p_tenant_id IS NULL OR p_festival_id IS NULL
 OR NOT (public.is_superadmin() OR p_tenant_id=public.get_my_tenant_id())
 OR NOT EXISTS(SELECT 1 FROM public.festival_calendar f WHERE f.id=p_festival_id AND f.tenant_id=p_tenant_id)
 THEN RAISE EXCEPTION 'Festival unavailable' USING ERRCODE='42501'; END IF;
 RETURN QUERY
 WITH base AS MATERIALIZED (
 SELECT s.id,s.item_id,s.festival_id FROM public.schedules s
 WHERE s.tenant_id=p_tenant_id AND s.festival_id=p_festival_id
 ), regs AS MATERIALIZED (
 SELECT b.id AS sid,r.id,r.status,r.is_verified,r.code_letter
 FROM base b JOIN public.registrations r ON r.item_id=b.item_id AND r.festival_id=b.festival_id
 ), counts AS (
 SELECT r.sid,count(*) FILTER(WHERE r.status IS DISTINCT FROM 'rejected') AS active,
 count(*) FILTER(WHERE r.status IS DISTINCT FROM 'rejected' AND r.is_verified) AS verified,
 count(*) FILTER(WHERE r.status IS DISTINCT FROM 'rejected' AND r.is_verified AND r.code_letter IS NOT NULL) AS coded,
 count(*) FILTER(WHERE r.status='rejected') AS rejected
 FROM regs r GROUP BY r.sid
 ), assignments AS MATERIALIZED (
 SELECT DISTINCT b.id AS sid,a.judge_id FROM base b JOIN public.schedule_judge_assignments a ON a.schedule_id=b.id
 JOIN public.judges j ON j.id=a.judge_id
 WHERE a.status='active' AND a.tenant_id=p_tenant_id
 ), eligible AS MATERIALIZED (
 SELECT r.sid,r.id FROM regs r WHERE r.status IS DISTINCT FROM 'rejected' AND r.is_verified AND coalesce(r.code_letter,'')<>''
 ), eligible_counts AS (
 SELECT e.sid,count(*) AS n FROM eligible e GROUP BY e.sid
 ), finals AS (
 SELECT a.sid,a.judge_id,count(DISTINCT e.id) AS n FROM assignments a
 JOIN public.mark_entries m ON m.schedule_id=a.sid AND m.judge_id=a.judge_id AND m.is_final
 JOIN eligible e ON e.sid=a.sid AND e.id=m.registration_id GROUP BY a.sid,a.judge_id
 ), panels AS (
 SELECT a.sid,count(*) AS assigned,count(*) FILTER(WHERE ec.n>0 AND coalesce(f.n,0)>=ec.n) AS submitted
 FROM assignments a LEFT JOIN eligible_counts ec ON ec.sid=a.sid
 LEFT JOIN finals f ON f.sid=a.sid AND f.judge_id=a.judge_id GROUP BY a.sid
 ), published AS (
 SELECT b.id AS sid,bool_or(r.published=true OR r.result_status='published') AS published,
 bool_or(r.collection_method='manual' AND (r.published=true OR r.result_status='published')) AS manual
 FROM base b JOIN public.results r ON r.schedule_id=b.id GROUP BY b.id
 ),
 -- Marks filter intentionally uses the existing canonical tenant-level contract.
 -- Its eligibility rules differ from badges; evaluate it ONCE, never per row.
 canonical_marks AS MATERIALIZED (
 SELECT j.schedule_id,j.marks_completed FROM public.get_judge_management_status(p_tenant_id) j
 )
 SELECT b.id,coalesce(c.active,0),coalesce(c.verified,0),coalesce(c.coded,0),coalesce(c.rejected,0),
 coalesce(p.assigned,0),coalesce(p.submitted,0),coalesce(cm.marks_completed,false),
 coalesce(pr.manual,false),coalesce(pr.published,false)
 FROM base b LEFT JOIN counts c ON c.sid=b.id LEFT JOIN panels p ON p.sid=b.id
 LEFT JOIN published pr ON pr.sid=b.id LEFT JOIN canonical_marks cm ON cm.schedule_id=b.id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_schedule_workflow_overview(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_schedule_workflow_overview(uuid,uuid) TO authenticated;
