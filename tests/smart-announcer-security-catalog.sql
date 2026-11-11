-- Read-only security regression checks. Every row must be true after rollout.
-- Run against the verified target or a disposable clone, never against a source project.
SELECT 'anonymous cannot execute legacy auto-publish' AS check_name,
       NOT has_function_privilege('anon', 'public.auto_publish_suspense_batch(uuid,uuid,integer)', 'EXECUTE') AS passed
UNION ALL
SELECT 'anonymous cannot execute legacy visibility mutation',
       NOT has_function_privilege('anon', 'public.toggle_announcer_result_visibility(text,uuid,boolean)', 'EXECUTE')
UNION ALL
SELECT 'anonymous cannot execute legacy strategic order',
       NOT has_function_privilege('anon', 'public.get_strategic_publish_order(uuid,uuid)', 'EXECUTE')
UNION ALL
SELECT 'anonymous cannot select announcer tokens',
       NOT has_table_privilege('anon', 'public.announcer_tokens', 'SELECT')
UNION ALL
SELECT 'active tokens are not exposed by a public select policy',
       NOT EXISTS (
         SELECT 1 FROM pg_catalog.pg_policies
         WHERE schemaname = 'public' AND tablename = 'announcer_tokens'
           AND cmd IN ('SELECT', 'ALL') AND ('public' = ANY (roles) OR 'anon' = ANY (roles))
       );
