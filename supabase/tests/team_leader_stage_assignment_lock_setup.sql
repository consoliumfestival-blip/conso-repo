ALTER TABLE public.items ADD COLUMN item_type text NOT NULL DEFAULT 'stage';
UPDATE public.items
SET item_type = CASE WHEN id IN (
  '10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003'
) THEN 'offstage' ELSE 'stage' END;
INSERT INTO public.items (id, item_code, item_name_en, category_codes, gender,
                          participation_type, is_active, item_type)
VALUES ('10000000-0000-0000-0000-000000000004', 'IND-3', 'On Stage Three', ARRAY['JR'],
        'both', 'individual', true, 'stage');

ALTER TABLE public.registrations ALTER COLUMN participant_id DROP NOT NULL;
ALTER TABLE public.registrations ADD COLUMN entry_chest_number text;
ALTER TABLE public.registrations ADD COLUMN raw_group_members jsonb;
ALTER TABLE public.registrations ADD COLUMN group_leader_participant_id uuid;
ALTER TABLE public.registrations ADD COLUMN is_group_registration boolean NOT NULL DEFAULT false;
ALTER TABLE public.participants ADD COLUMN name text;
ALTER TABLE public.participants ADD COLUMN chest_number text;
UPDATE public.participants participant
SET name = member.name, chest_number = participant.id::text
FROM team_assignment_test.members member
WHERE member.id = participant.id;

CREATE TABLE public.group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL REFERENCES public.registrations(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL,
  member_order integer
);
CREATE TABLE public.profiles (id uuid PRIMARY KEY, role text NOT NULL);
INSERT INTO public.profiles (id, role) VALUES
  ('50000000-0000-0000-0000-000000000001', 'team_leader'),
  ('50000000-0000-0000-0000-000000000002', 'admin');

SELECT set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000001', false);
