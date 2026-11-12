-- Extend the synthetic schema to load the repository's real admin results RPC.
ALTER TABLE public.festival_calendar ADD COLUMN is_active boolean, ADD COLUMN festival_year integer, ADD COLUMN start_date date;
ALTER TABLE public.participants ADD COLUMN chest_number text;
ALTER TABLE public.results ADD COLUMN total_score numeric, ADD COLUMN collection_method text, ADD COLUMN published_at timestamptz;
CREATE TABLE public.schedules(id uuid, item_id uuid, tenant_id uuid, start_time timestamptz);
DROP FUNCTION public.get_admin_published_results(uuid,uuid);
