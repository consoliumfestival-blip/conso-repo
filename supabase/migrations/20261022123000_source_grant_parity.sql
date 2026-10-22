-- TARGET ONLY: negkevoetuvuqqlecdno
-- Source catalog observed: 2026-10-22T12:24:35.985Z
-- Source Supabase was queried only through the read-only catalog endpoint.
-- No source rows, Auth users, Storage objects or points configuration records imported.
-- source_catalog_sha256=0df08fe41aebe6770892340b3f08a479bac38ae22ceda50ee65f2b10b1351a42
-- target_catalog_sha256=dbe76dc92f1f96ad1e2093cf393e7c5865d20327a2725381147777a155edc70e
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';
SET LOCAL check_function_bodies = false;

-- Table grants
REVOKE ALL PRIVILEGES ON TABLE "public"."festival_chest_number_controls" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "public"."festival_chest_number_controls" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE "public"."festival_chest_number_controls" FROM "authenticated";
REVOKE ALL PRIVILEGES ON TABLE "public"."festival_chest_number_controls" FROM "service_role";
REVOKE ALL PRIVILEGES ON TABLE "public"."festival_chest_number_controls" FROM "postgres";

GRANT DELETE ON TABLE "public"."festival_chest_number_controls" TO "postgres";

GRANT INSERT ON TABLE "public"."festival_chest_number_controls" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."festival_chest_number_controls" TO "postgres";

GRANT REFERENCES ON TABLE "public"."festival_chest_number_controls" TO "postgres";

GRANT SELECT ON TABLE "public"."festival_chest_number_controls" TO "postgres";

GRANT TRIGGER ON TABLE "public"."festival_chest_number_controls" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."festival_chest_number_controls" TO "postgres";

GRANT UPDATE ON TABLE "public"."festival_chest_number_controls" TO "postgres";

GRANT DELETE ON TABLE "public"."festival_chest_number_controls" TO "service_role";

GRANT INSERT ON TABLE "public"."festival_chest_number_controls" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."festival_chest_number_controls" TO "service_role";

GRANT REFERENCES ON TABLE "public"."festival_chest_number_controls" TO "service_role";

GRANT SELECT ON TABLE "public"."festival_chest_number_controls" TO "service_role";

GRANT TRIGGER ON TABLE "public"."festival_chest_number_controls" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."festival_chest_number_controls" TO "service_role";

GRANT UPDATE ON TABLE "public"."festival_chest_number_controls" TO "service_role";

REVOKE ALL PRIVILEGES ON TABLE "public"."festival_team_chest_slots" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "public"."festival_team_chest_slots" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE "public"."festival_team_chest_slots" FROM "authenticated";
REVOKE ALL PRIVILEGES ON TABLE "public"."festival_team_chest_slots" FROM "service_role";
REVOKE ALL PRIVILEGES ON TABLE "public"."festival_team_chest_slots" FROM "postgres";

GRANT DELETE ON TABLE "public"."festival_team_chest_slots" TO "postgres";

GRANT INSERT ON TABLE "public"."festival_team_chest_slots" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."festival_team_chest_slots" TO "postgres";

GRANT REFERENCES ON TABLE "public"."festival_team_chest_slots" TO "postgres";

GRANT SELECT ON TABLE "public"."festival_team_chest_slots" TO "postgres";

GRANT TRIGGER ON TABLE "public"."festival_team_chest_slots" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."festival_team_chest_slots" TO "postgres";

GRANT UPDATE ON TABLE "public"."festival_team_chest_slots" TO "postgres";

GRANT DELETE ON TABLE "public"."festival_team_chest_slots" TO "service_role";

GRANT INSERT ON TABLE "public"."festival_team_chest_slots" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."festival_team_chest_slots" TO "service_role";

GRANT REFERENCES ON TABLE "public"."festival_team_chest_slots" TO "service_role";

GRANT SELECT ON TABLE "public"."festival_team_chest_slots" TO "service_role";

GRANT TRIGGER ON TABLE "public"."festival_team_chest_slots" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."festival_team_chest_slots" TO "service_role";

GRANT UPDATE ON TABLE "public"."festival_team_chest_slots" TO "service_role";

REVOKE ALL PRIVILEGES ON TABLE "public"."general_entry_number_counters" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "public"."general_entry_number_counters" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE "public"."general_entry_number_counters" FROM "authenticated";
REVOKE ALL PRIVILEGES ON TABLE "public"."general_entry_number_counters" FROM "service_role";
REVOKE ALL PRIVILEGES ON TABLE "public"."general_entry_number_counters" FROM "postgres";

GRANT DELETE ON TABLE "public"."general_entry_number_counters" TO "postgres";

GRANT INSERT ON TABLE "public"."general_entry_number_counters" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."general_entry_number_counters" TO "postgres";

GRANT REFERENCES ON TABLE "public"."general_entry_number_counters" TO "postgres";

GRANT SELECT ON TABLE "public"."general_entry_number_counters" TO "postgres";

GRANT TRIGGER ON TABLE "public"."general_entry_number_counters" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."general_entry_number_counters" TO "postgres";

GRANT UPDATE ON TABLE "public"."general_entry_number_counters" TO "postgres";

GRANT DELETE ON TABLE "public"."general_entry_number_counters" TO "service_role";

GRANT INSERT ON TABLE "public"."general_entry_number_counters" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."general_entry_number_counters" TO "service_role";

GRANT REFERENCES ON TABLE "public"."general_entry_number_counters" TO "service_role";

GRANT SELECT ON TABLE "public"."general_entry_number_counters" TO "service_role";

GRANT TRIGGER ON TABLE "public"."general_entry_number_counters" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."general_entry_number_counters" TO "service_role";

GRANT UPDATE ON TABLE "public"."general_entry_number_counters" TO "service_role";

REVOKE ALL PRIVILEGES ON TABLE "public"."grace_submissions" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "public"."grace_submissions" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE "public"."grace_submissions" FROM "authenticated";
REVOKE ALL PRIVILEGES ON TABLE "public"."grace_submissions" FROM "service_role";
REVOKE ALL PRIVILEGES ON TABLE "public"."grace_submissions" FROM "postgres";

GRANT SELECT ON TABLE "public"."grace_submissions" TO "authenticated";

GRANT DELETE ON TABLE "public"."grace_submissions" TO "postgres";

GRANT INSERT ON TABLE "public"."grace_submissions" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."grace_submissions" TO "postgres";

GRANT REFERENCES ON TABLE "public"."grace_submissions" TO "postgres";

GRANT SELECT ON TABLE "public"."grace_submissions" TO "postgres";

GRANT TRIGGER ON TABLE "public"."grace_submissions" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."grace_submissions" TO "postgres";

GRANT UPDATE ON TABLE "public"."grace_submissions" TO "postgres";

GRANT DELETE ON TABLE "public"."grace_submissions" TO "service_role";

GRANT INSERT ON TABLE "public"."grace_submissions" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."grace_submissions" TO "service_role";

GRANT REFERENCES ON TABLE "public"."grace_submissions" TO "service_role";

GRANT SELECT ON TABLE "public"."grace_submissions" TO "service_role";

GRANT TRIGGER ON TABLE "public"."grace_submissions" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."grace_submissions" TO "service_role";

GRANT UPDATE ON TABLE "public"."grace_submissions" TO "service_role";

REVOKE ALL PRIVILEGES ON TABLE "public"."grace_workspaces" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "public"."grace_workspaces" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE "public"."grace_workspaces" FROM "authenticated";
REVOKE ALL PRIVILEGES ON TABLE "public"."grace_workspaces" FROM "service_role";
REVOKE ALL PRIVILEGES ON TABLE "public"."grace_workspaces" FROM "postgres";

GRANT SELECT ON TABLE "public"."grace_workspaces" TO "authenticated";

GRANT DELETE ON TABLE "public"."grace_workspaces" TO "postgres";

GRANT INSERT ON TABLE "public"."grace_workspaces" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."grace_workspaces" TO "postgres";

GRANT REFERENCES ON TABLE "public"."grace_workspaces" TO "postgres";

GRANT SELECT ON TABLE "public"."grace_workspaces" TO "postgres";

GRANT TRIGGER ON TABLE "public"."grace_workspaces" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."grace_workspaces" TO "postgres";

GRANT UPDATE ON TABLE "public"."grace_workspaces" TO "postgres";

GRANT DELETE ON TABLE "public"."grace_workspaces" TO "service_role";

GRANT INSERT ON TABLE "public"."grace_workspaces" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."grace_workspaces" TO "service_role";

GRANT REFERENCES ON TABLE "public"."grace_workspaces" TO "service_role";

GRANT SELECT ON TABLE "public"."grace_workspaces" TO "service_role";

GRANT TRIGGER ON TABLE "public"."grace_workspaces" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."grace_workspaces" TO "service_role";

GRANT UPDATE ON TABLE "public"."grace_workspaces" TO "service_role";

REVOKE ALL PRIVILEGES ON TABLE "public"."participant_chest_number_changes" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "public"."participant_chest_number_changes" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE "public"."participant_chest_number_changes" FROM "authenticated";
REVOKE ALL PRIVILEGES ON TABLE "public"."participant_chest_number_changes" FROM "service_role";
REVOKE ALL PRIVILEGES ON TABLE "public"."participant_chest_number_changes" FROM "postgres";

GRANT SELECT ON TABLE "public"."participant_chest_number_changes" TO "authenticated";

GRANT DELETE ON TABLE "public"."participant_chest_number_changes" TO "postgres";

GRANT INSERT ON TABLE "public"."participant_chest_number_changes" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."participant_chest_number_changes" TO "postgres";

GRANT REFERENCES ON TABLE "public"."participant_chest_number_changes" TO "postgres";

GRANT SELECT ON TABLE "public"."participant_chest_number_changes" TO "postgres";

GRANT TRIGGER ON TABLE "public"."participant_chest_number_changes" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."participant_chest_number_changes" TO "postgres";

GRANT UPDATE ON TABLE "public"."participant_chest_number_changes" TO "postgres";

GRANT DELETE ON TABLE "public"."participant_chest_number_changes" TO "service_role";

GRANT INSERT ON TABLE "public"."participant_chest_number_changes" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."participant_chest_number_changes" TO "service_role";

GRANT REFERENCES ON TABLE "public"."participant_chest_number_changes" TO "service_role";

GRANT SELECT ON TABLE "public"."participant_chest_number_changes" TO "service_role";

GRANT TRIGGER ON TABLE "public"."participant_chest_number_changes" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."participant_chest_number_changes" TO "service_role";

GRANT UPDATE ON TABLE "public"."participant_chest_number_changes" TO "service_role";

REVOKE ALL PRIVILEGES ON TABLE "public"."program_intake_statuses" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "public"."program_intake_statuses" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE "public"."program_intake_statuses" FROM "authenticated";
REVOKE ALL PRIVILEGES ON TABLE "public"."program_intake_statuses" FROM "service_role";
REVOKE ALL PRIVILEGES ON TABLE "public"."program_intake_statuses" FROM "postgres";

GRANT SELECT ON TABLE "public"."program_intake_statuses" TO "authenticated";

GRANT DELETE ON TABLE "public"."program_intake_statuses" TO "postgres";

GRANT INSERT ON TABLE "public"."program_intake_statuses" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."program_intake_statuses" TO "postgres";

GRANT REFERENCES ON TABLE "public"."program_intake_statuses" TO "postgres";

GRANT SELECT ON TABLE "public"."program_intake_statuses" TO "postgres";

GRANT TRIGGER ON TABLE "public"."program_intake_statuses" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."program_intake_statuses" TO "postgres";

GRANT UPDATE ON TABLE "public"."program_intake_statuses" TO "postgres";

GRANT DELETE ON TABLE "public"."program_intake_statuses" TO "service_role";

GRANT INSERT ON TABLE "public"."program_intake_statuses" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."program_intake_statuses" TO "service_role";

GRANT REFERENCES ON TABLE "public"."program_intake_statuses" TO "service_role";

GRANT SELECT ON TABLE "public"."program_intake_statuses" TO "service_role";

GRANT TRIGGER ON TABLE "public"."program_intake_statuses" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."program_intake_statuses" TO "service_role";

GRANT UPDATE ON TABLE "public"."program_intake_statuses" TO "service_role";

REVOKE ALL PRIVILEGES ON TABLE "public"."scoring_publications" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "public"."scoring_publications" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE "public"."scoring_publications" FROM "authenticated";
REVOKE ALL PRIVILEGES ON TABLE "public"."scoring_publications" FROM "service_role";
REVOKE ALL PRIVILEGES ON TABLE "public"."scoring_publications" FROM "postgres";

GRANT SELECT ON TABLE "public"."scoring_publications" TO "authenticated";

GRANT DELETE ON TABLE "public"."scoring_publications" TO "postgres";

GRANT INSERT ON TABLE "public"."scoring_publications" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."scoring_publications" TO "postgres";

GRANT REFERENCES ON TABLE "public"."scoring_publications" TO "postgres";

GRANT SELECT ON TABLE "public"."scoring_publications" TO "postgres";

GRANT TRIGGER ON TABLE "public"."scoring_publications" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."scoring_publications" TO "postgres";

GRANT UPDATE ON TABLE "public"."scoring_publications" TO "postgres";

GRANT DELETE ON TABLE "public"."scoring_publications" TO "service_role";

GRANT INSERT ON TABLE "public"."scoring_publications" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."scoring_publications" TO "service_role";

GRANT REFERENCES ON TABLE "public"."scoring_publications" TO "service_role";

GRANT SELECT ON TABLE "public"."scoring_publications" TO "service_role";

GRANT TRIGGER ON TABLE "public"."scoring_publications" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."scoring_publications" TO "service_role";

GRANT UPDATE ON TABLE "public"."scoring_publications" TO "service_role";

-- Function grants
REVOKE ALL PRIVILEGES ON FUNCTION "public"."_legacy_execute_junior_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id uuid, p_participants jsonb) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."_legacy_execute_junior_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id uuid, p_participants jsonb) FROM "anon";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."_legacy_execute_junior_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id uuid, p_participants jsonb) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."_legacy_execute_junior_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id uuid, p_participants jsonb) FROM "service_role";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."_legacy_execute_junior_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id uuid, p_participants jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."_legacy_execute_junior_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id uuid, p_participants jsonb) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."_legacy_execute_junior_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id uuid, p_participants jsonb) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."_legacy_execute_senior_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id uuid, p_participants jsonb) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."_legacy_execute_senior_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id uuid, p_participants jsonb) FROM "anon";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."_legacy_execute_senior_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id uuid, p_participants jsonb) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."_legacy_execute_senior_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id uuid, p_participants jsonb) FROM "service_role";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."_legacy_execute_senior_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id uuid, p_participants jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."_legacy_execute_senior_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id uuid, p_participants jsonb) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."_legacy_execute_senior_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id uuid, p_participants jsonb) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."_legacy_execute_upper_primary_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id uuid, p_participants jsonb) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."_legacy_execute_upper_primary_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id uuid, p_participants jsonb) FROM "anon";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."_legacy_execute_upper_primary_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id uuid, p_participants jsonb) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."_legacy_execute_upper_primary_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id uuid, p_participants jsonb) FROM "service_role";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."_legacy_execute_upper_primary_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id uuid, p_participants jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."_legacy_execute_upper_primary_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id uuid, p_participants jsonb) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."_legacy_execute_upper_primary_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id uuid, p_participants jsonb) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."_legacy_execute_lp_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."_legacy_execute_lp_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb) FROM "anon";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."_legacy_execute_lp_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."_legacy_execute_lp_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb) FROM "service_role";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."_legacy_execute_lp_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."_legacy_execute_lp_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."_legacy_execute_lp_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."_legacy_execute_hs_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."_legacy_execute_hs_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb) FROM "anon";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."_legacy_execute_hs_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."_legacy_execute_hs_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb) FROM "service_role";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."_legacy_execute_hs_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."_legacy_execute_hs_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."_legacy_execute_hs_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."_legacy_execute_hss_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."_legacy_execute_hss_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb) FROM "anon";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."_legacy_execute_hss_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."_legacy_execute_hss_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb) FROM "service_role";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."_legacy_execute_hss_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."_legacy_execute_hss_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."_legacy_execute_hss_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."_legacy_execute_general_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."_legacy_execute_general_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb) FROM "anon";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."_legacy_execute_general_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."_legacy_execute_general_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb) FROM "service_role";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."_legacy_execute_general_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."_legacy_execute_general_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."_legacy_execute_general_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_next_festival_category_chest_number"(p_festival_id uuid, p_category_code text) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_next_festival_category_chest_number"(p_festival_id uuid, p_category_code text) FROM "anon";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_next_festival_category_chest_number"(p_festival_id uuid, p_category_code text) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_next_festival_category_chest_number"(p_festival_id uuid, p_category_code text) FROM "service_role";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_next_festival_category_chest_number"(p_festival_id uuid, p_category_code text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_next_festival_category_chest_number"(p_festival_id uuid, p_category_code text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_next_festival_category_chest_number"(p_festival_id uuid, p_category_code text) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."preview_competition_points"(p_schedule_id uuid, p_expected_version integer, p_entries jsonb, p_mode text, p_bracket text, p_group_size integer) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."preview_competition_points"(p_schedule_id uuid, p_expected_version integer, p_entries jsonb, p_mode text, p_bracket text, p_group_size integer) FROM "anon";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."preview_competition_points"(p_schedule_id uuid, p_expected_version integer, p_entries jsonb, p_mode text, p_bracket text, p_group_size integer) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."preview_competition_points"(p_schedule_id uuid, p_expected_version integer, p_entries jsonb, p_mode text, p_bracket text, p_group_size integer) FROM "service_role";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."preview_competition_points"(p_schedule_id uuid, p_expected_version integer, p_entries jsonb, p_mode text, p_bracket text, p_group_size integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."preview_competition_points"(p_schedule_id uuid, p_expected_version integer, p_entries jsonb, p_mode text, p_bracket text, p_group_size integer) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."preview_competition_points"(p_schedule_id uuid, p_expected_version integer, p_entries jsonb, p_mode text, p_bracket text, p_group_size integer) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."preview_competition_points"(p_schedule_id uuid, p_expected_version integer, p_entries jsonb, p_mode text, p_bracket text, p_group_size integer) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."publish_competition_results"(p_schedule_id uuid, p_expected_version integer, p_entries jsonb, p_mode text, p_request_id uuid, p_bracket text, p_group_size integer) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."publish_competition_results"(p_schedule_id uuid, p_expected_version integer, p_entries jsonb, p_mode text, p_request_id uuid, p_bracket text, p_group_size integer) FROM "anon";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."publish_competition_results"(p_schedule_id uuid, p_expected_version integer, p_entries jsonb, p_mode text, p_request_id uuid, p_bracket text, p_group_size integer) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."publish_competition_results"(p_schedule_id uuid, p_expected_version integer, p_entries jsonb, p_mode text, p_request_id uuid, p_bracket text, p_group_size integer) FROM "service_role";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."publish_competition_results"(p_schedule_id uuid, p_expected_version integer, p_entries jsonb, p_mode text, p_request_id uuid, p_bracket text, p_group_size integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."publish_competition_results"(p_schedule_id uuid, p_expected_version integer, p_entries jsonb, p_mode text, p_request_id uuid, p_bracket text, p_group_size integer) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."publish_competition_results"(p_schedule_id uuid, p_expected_version integer, p_entries jsonb, p_mode text, p_request_id uuid, p_bracket text, p_group_size integer) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."publish_competition_results"(p_schedule_id uuid, p_expected_version integer, p_entries jsonb, p_mode text, p_request_id uuid, p_bracket text, p_group_size integer) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."save_scoring_configuration"(p_festival_id uuid, p_expected_version integer, p_config jsonb, p_reason text) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."save_scoring_configuration"(p_festival_id uuid, p_expected_version integer, p_config jsonb, p_reason text) FROM "anon";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."save_scoring_configuration"(p_festival_id uuid, p_expected_version integer, p_config jsonb, p_reason text) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."save_scoring_configuration"(p_festival_id uuid, p_expected_version integer, p_config jsonb, p_reason text) FROM "service_role";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."save_scoring_configuration"(p_festival_id uuid, p_expected_version integer, p_config jsonb, p_reason text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."save_scoring_configuration"(p_festival_id uuid, p_expected_version integer, p_config jsonb, p_reason text) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."save_scoring_configuration"(p_festival_id uuid, p_expected_version integer, p_config jsonb, p_reason text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."save_scoring_configuration"(p_festival_id uuid, p_expected_version integer, p_config jsonb, p_reason text) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_grace_workspace"(p_festival_id uuid) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_grace_workspace"(p_festival_id uuid) FROM "anon";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_grace_workspace"(p_festival_id uuid) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_grace_workspace"(p_festival_id uuid) FROM "service_role";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_grace_workspace"(p_festival_id uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_grace_workspace"(p_festival_id uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_grace_workspace"(p_festival_id uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_grace_workspace"(p_festival_id uuid) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."save_grace_draft"(p_festival_id uuid, p_expected_version integer, p_expected_revision integer, p_entries jsonb) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."save_grace_draft"(p_festival_id uuid, p_expected_version integer, p_expected_revision integer, p_entries jsonb) FROM "anon";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."save_grace_draft"(p_festival_id uuid, p_expected_version integer, p_expected_revision integer, p_entries jsonb) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."save_grace_draft"(p_festival_id uuid, p_expected_version integer, p_expected_revision integer, p_entries jsonb) FROM "service_role";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."save_grace_draft"(p_festival_id uuid, p_expected_version integer, p_expected_revision integer, p_entries jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."save_grace_draft"(p_festival_id uuid, p_expected_version integer, p_expected_revision integer, p_entries jsonb) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."save_grace_draft"(p_festival_id uuid, p_expected_version integer, p_expected_revision integer, p_entries jsonb) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."save_grace_draft"(p_festival_id uuid, p_expected_version integer, p_expected_revision integer, p_entries jsonb) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."submit_all_grace_marks"(p_festival_id uuid, p_expected_version integer, p_expected_revision integer) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."submit_all_grace_marks"(p_festival_id uuid, p_expected_version integer, p_expected_revision integer) FROM "anon";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."submit_all_grace_marks"(p_festival_id uuid, p_expected_version integer, p_expected_revision integer) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."submit_all_grace_marks"(p_festival_id uuid, p_expected_version integer, p_expected_revision integer) FROM "service_role";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."submit_all_grace_marks"(p_festival_id uuid, p_expected_version integer, p_expected_revision integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."submit_all_grace_marks"(p_festival_id uuid, p_expected_version integer, p_expected_revision integer) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."submit_all_grace_marks"(p_festival_id uuid, p_expected_version integer, p_expected_revision integer) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."submit_all_grace_marks"(p_festival_id uuid, p_expected_version integer, p_expected_revision integer) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."save_competition_items"(p_festival_id uuid, p_codes text[], p_records jsonb) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."save_competition_items"(p_festival_id uuid, p_codes text[], p_records jsonb) FROM "anon";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."save_competition_items"(p_festival_id uuid, p_codes text[], p_records jsonb) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."save_competition_items"(p_festival_id uuid, p_codes text[], p_records jsonb) FROM "service_role";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."save_competition_items"(p_festival_id uuid, p_codes text[], p_records jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."save_competition_items"(p_festival_id uuid, p_codes text[], p_records jsonb) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."save_competition_items"(p_festival_id uuid, p_codes text[], p_records jsonb) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."save_competition_items"(p_festival_id uuid, p_codes text[], p_records jsonb) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."create_general_team_entry"(p_festival_id uuid, p_item_id uuid, p_participant_ids uuid[]) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."create_general_team_entry"(p_festival_id uuid, p_item_id uuid, p_participant_ids uuid[]) FROM "anon";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."create_general_team_entry"(p_festival_id uuid, p_item_id uuid, p_participant_ids uuid[]) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."create_general_team_entry"(p_festival_id uuid, p_item_id uuid, p_participant_ids uuid[]) FROM "service_role";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."create_general_team_entry"(p_festival_id uuid, p_item_id uuid, p_participant_ids uuid[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."create_general_team_entry"(p_festival_id uuid, p_item_id uuid, p_participant_ids uuid[]) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."create_general_team_entry"(p_festival_id uuid, p_item_id uuid, p_participant_ids uuid[]) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."create_general_team_entry"(p_festival_id uuid, p_item_id uuid, p_participant_ids uuid[]) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_participant_general_results"(p_participant_id uuid) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_participant_general_results"(p_participant_id uuid) FROM "anon";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_participant_general_results"(p_participant_id uuid) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_participant_general_results"(p_participant_id uuid) FROM "service_role";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_participant_general_results"(p_participant_id uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_participant_general_results"(p_participant_id uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_participant_general_results"(p_participant_id uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_participant_general_results"(p_participant_id uuid) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."enforce_festival_participant_gender"() FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."enforce_festival_participant_gender"() FROM "anon";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."enforce_festival_participant_gender"() FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."enforce_festival_participant_gender"() FROM "service_role";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."enforce_festival_participant_gender"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."enforce_festival_participant_gender"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."enforce_festival_participant_gender"() TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."create_participant_with_chest_number"(p_tenant_id uuid, p_festival_id uuid, p_organisation_id uuid, p_name text, p_category_code text, p_status text, p_age integer, p_class_std text, p_dob date, p_gender text, p_public_profile_enabled boolean, p_show_organisation_public boolean) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."create_participant_with_chest_number"(p_tenant_id uuid, p_festival_id uuid, p_organisation_id uuid, p_name text, p_category_code text, p_status text, p_age integer, p_class_std text, p_dob date, p_gender text, p_public_profile_enabled boolean, p_show_organisation_public boolean) FROM "anon";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."create_participant_with_chest_number"(p_tenant_id uuid, p_festival_id uuid, p_organisation_id uuid, p_name text, p_category_code text, p_status text, p_age integer, p_class_std text, p_dob date, p_gender text, p_public_profile_enabled boolean, p_show_organisation_public boolean) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."create_participant_with_chest_number"(p_tenant_id uuid, p_festival_id uuid, p_organisation_id uuid, p_name text, p_category_code text, p_status text, p_age integer, p_class_std text, p_dob date, p_gender text, p_public_profile_enabled boolean, p_show_organisation_public boolean) FROM "service_role";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."create_participant_with_chest_number"(p_tenant_id uuid, p_festival_id uuid, p_organisation_id uuid, p_name text, p_category_code text, p_status text, p_age integer, p_class_std text, p_dob date, p_gender text, p_public_profile_enabled boolean, p_show_organisation_public boolean) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."create_participant_with_chest_number"(p_tenant_id uuid, p_festival_id uuid, p_organisation_id uuid, p_name text, p_category_code text, p_status text, p_age integer, p_class_std text, p_dob date, p_gender text, p_public_profile_enabled boolean, p_show_organisation_public boolean) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."create_participant_with_chest_number"(p_tenant_id uuid, p_festival_id uuid, p_organisation_id uuid, p_name text, p_category_code text, p_status text, p_age integer, p_class_std text, p_dob date, p_gender text, p_public_profile_enabled boolean, p_show_organisation_public boolean) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."create_participant_with_chest_number"(p_tenant_id uuid, p_festival_id uuid, p_organisation_id uuid, p_name text, p_category_code text, p_status text, p_age integer, p_class_std text, p_dob date, p_gender text, p_public_profile_enabled boolean, p_show_organisation_public boolean) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."set_program_intake_status"(p_festival_id uuid, p_item_id uuid, p_category_code text, p_entry_kind text, p_is_complete boolean) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."set_program_intake_status"(p_festival_id uuid, p_item_id uuid, p_category_code text, p_entry_kind text, p_is_complete boolean) FROM "anon";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."set_program_intake_status"(p_festival_id uuid, p_item_id uuid, p_category_code text, p_entry_kind text, p_is_complete boolean) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."set_program_intake_status"(p_festival_id uuid, p_item_id uuid, p_category_code text, p_entry_kind text, p_is_complete boolean) FROM "service_role";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."set_program_intake_status"(p_festival_id uuid, p_item_id uuid, p_category_code text, p_entry_kind text, p_is_complete boolean) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_program_intake_status"(p_festival_id uuid, p_item_id uuid, p_category_code text, p_entry_kind text, p_is_complete boolean) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."set_program_intake_status"(p_festival_id uuid, p_item_id uuid, p_category_code text, p_entry_kind text, p_is_complete boolean) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_program_intake_status"(p_festival_id uuid, p_item_id uuid, p_category_code text, p_entry_kind text, p_is_complete boolean) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."reopen_program_intake_on_registration_change"() FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."reopen_program_intake_on_registration_change"() FROM "anon";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."reopen_program_intake_on_registration_change"() FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."reopen_program_intake_on_registration_change"() FROM "service_role";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."reopen_program_intake_on_registration_change"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."reopen_program_intake_on_registration_change"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."reopen_program_intake_on_registration_change"() TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."apply_competition_item_changes"(p_festival_id uuid, p_activate_codes text[], p_deactivate_codes text[], p_records jsonb) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."apply_competition_item_changes"(p_festival_id uuid, p_activate_codes text[], p_deactivate_codes text[], p_records jsonb) FROM "anon";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."apply_competition_item_changes"(p_festival_id uuid, p_activate_codes text[], p_deactivate_codes text[], p_records jsonb) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."apply_competition_item_changes"(p_festival_id uuid, p_activate_codes text[], p_deactivate_codes text[], p_records jsonb) FROM "service_role";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."apply_competition_item_changes"(p_festival_id uuid, p_activate_codes text[], p_deactivate_codes text[], p_records jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."apply_competition_item_changes"(p_festival_id uuid, p_activate_codes text[], p_deactivate_codes text[], p_records jsonb) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."apply_competition_item_changes"(p_festival_id uuid, p_activate_codes text[], p_deactivate_codes text[], p_records jsonb) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."apply_competition_item_changes"(p_festival_id uuid, p_activate_codes text[], p_deactivate_codes text[], p_records jsonb) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."delete_archived_organisation"(p_org_id uuid) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."delete_archived_organisation"(p_org_id uuid) FROM "anon";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."delete_archived_organisation"(p_org_id uuid) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."delete_archived_organisation"(p_org_id uuid) FROM "service_role";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."delete_archived_organisation"(p_org_id uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."delete_archived_organisation"(p_org_id uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."delete_archived_organisation"(p_org_id uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."delete_archived_organisation"(p_org_id uuid) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."ensure_festival_team_chest_slots"(p_festival_id uuid) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."ensure_festival_team_chest_slots"(p_festival_id uuid) FROM "anon";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."ensure_festival_team_chest_slots"(p_festival_id uuid) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."ensure_festival_team_chest_slots"(p_festival_id uuid) FROM "service_role";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."ensure_festival_team_chest_slots"(p_festival_id uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."ensure_festival_team_chest_slots"(p_festival_id uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."ensure_festival_team_chest_slots"(p_festival_id uuid) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."festival_team_chest_slot"(p_festival_id uuid, p_organisation_id uuid) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."festival_team_chest_slot"(p_festival_id uuid, p_organisation_id uuid) FROM "anon";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."festival_team_chest_slot"(p_festival_id uuid, p_organisation_id uuid) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."festival_team_chest_slot"(p_festival_id uuid, p_organisation_id uuid) FROM "service_role";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."festival_team_chest_slot"(p_festival_id uuid, p_organisation_id uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."festival_team_chest_slot"(p_festival_id uuid, p_organisation_id uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."festival_team_chest_slot"(p_festival_id uuid, p_organisation_id uuid) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."validate_team_chest_number_on_insert"() FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."validate_team_chest_number_on_insert"() FROM "anon";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."validate_team_chest_number_on_insert"() FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."validate_team_chest_number_on_insert"() FROM "service_role";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."validate_team_chest_number_on_insert"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."validate_team_chest_number_on_insert"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."validate_team_chest_number_on_insert"() TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."sync_festival_chest_numbers_on_settings_change"() FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."sync_festival_chest_numbers_on_settings_change"() FROM "anon";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."sync_festival_chest_numbers_on_settings_change"() FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."sync_festival_chest_numbers_on_settings_change"() FROM "service_role";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."sync_festival_chest_numbers_on_settings_change"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."sync_festival_chest_numbers_on_settings_change"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."sync_festival_chest_numbers_on_settings_change"() TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."renumber_participant_on_team_change"() FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."renumber_participant_on_team_change"() FROM "anon";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."renumber_participant_on_team_change"() FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."renumber_participant_on_team_change"() FROM "service_role";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."renumber_participant_on_team_change"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."renumber_participant_on_team_change"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."renumber_participant_on_team_change"() TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."audit_participant_chest_number_change"() FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."audit_participant_chest_number_change"() FROM "anon";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."audit_participant_chest_number_change"() FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."audit_participant_chest_number_change"() FROM "service_role";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."audit_participant_chest_number_change"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."audit_participant_chest_number_change"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."audit_participant_chest_number_change"() TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."assert_legacy_chest_import_allowed"(p_tenant_id uuid, p_festival_id uuid) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."assert_legacy_chest_import_allowed"(p_tenant_id uuid, p_festival_id uuid) FROM "anon";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."assert_legacy_chest_import_allowed"(p_tenant_id uuid, p_festival_id uuid) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."assert_legacy_chest_import_allowed"(p_tenant_id uuid, p_festival_id uuid) FROM "service_role";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."assert_legacy_chest_import_allowed"(p_tenant_id uuid, p_festival_id uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."assert_legacy_chest_import_allowed"(p_tenant_id uuid, p_festival_id uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."assert_legacy_chest_import_allowed"(p_tenant_id uuid, p_festival_id uuid) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_stage_management_venue_codes"(p_festival_id uuid) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_stage_management_venue_codes"(p_festival_id uuid) FROM "anon";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_stage_management_venue_codes"(p_festival_id uuid) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_stage_management_venue_codes"(p_festival_id uuid) FROM "service_role";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_stage_management_venue_codes"(p_festival_id uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_stage_management_venue_codes"(p_festival_id uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_stage_management_venue_codes"(p_festival_id uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_stage_management_venue_codes"(p_festival_id uuid) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."stage_edit_code_letter"(p_schedule_id uuid, p_registration_id uuid, p_code_letter text, p_expected_letter text, p_expected_swap_id uuid) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."stage_edit_code_letter"(p_schedule_id uuid, p_registration_id uuid, p_code_letter text, p_expected_letter text, p_expected_swap_id uuid) FROM "anon";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."stage_edit_code_letter"(p_schedule_id uuid, p_registration_id uuid, p_code_letter text, p_expected_letter text, p_expected_swap_id uuid) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."stage_edit_code_letter"(p_schedule_id uuid, p_registration_id uuid, p_code_letter text, p_expected_letter text, p_expected_swap_id uuid) FROM "service_role";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."stage_edit_code_letter"(p_schedule_id uuid, p_registration_id uuid, p_code_letter text, p_expected_letter text, p_expected_swap_id uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."stage_edit_code_letter"(p_schedule_id uuid, p_registration_id uuid, p_code_letter text, p_expected_letter text, p_expected_swap_id uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."stage_edit_code_letter"(p_schedule_id uuid, p_registration_id uuid, p_code_letter text, p_expected_letter text, p_expected_swap_id uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."stage_edit_code_letter"(p_schedule_id uuid, p_registration_id uuid, p_code_letter text, p_expected_letter text, p_expected_swap_id uuid) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."stage_draw_code_letters"(p_schedule_id uuid, p_overwrite boolean) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."stage_draw_code_letters"(p_schedule_id uuid, p_overwrite boolean) FROM "anon";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."stage_draw_code_letters"(p_schedule_id uuid, p_overwrite boolean) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."stage_draw_code_letters"(p_schedule_id uuid, p_overwrite boolean) FROM "service_role";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."stage_draw_code_letters"(p_schedule_id uuid, p_overwrite boolean) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."stage_draw_code_letters"(p_schedule_id uuid, p_overwrite boolean) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."stage_draw_code_letters"(p_schedule_id uuid, p_overwrite boolean) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."stage_draw_code_letters"(p_schedule_id uuid, p_overwrite boolean) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_stage_management_registrations_with_letters"(p_schedule_id uuid, p_festival_id uuid) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_stage_management_registrations_with_letters"(p_schedule_id uuid, p_festival_id uuid) FROM "anon";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_stage_management_registrations_with_letters"(p_schedule_id uuid, p_festival_id uuid) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_stage_management_registrations_with_letters"(p_schedule_id uuid, p_festival_id uuid) FROM "service_role";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_stage_management_registrations_with_letters"(p_schedule_id uuid, p_festival_id uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_stage_management_registrations_with_letters"(p_schedule_id uuid, p_festival_id uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_stage_management_registrations_with_letters"(p_schedule_id uuid, p_festival_id uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_stage_management_registrations_with_letters"(p_schedule_id uuid, p_festival_id uuid) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_team_leader_programs"(p_participant_id uuid) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_team_leader_programs"(p_participant_id uuid) FROM "anon";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_team_leader_programs"(p_participant_id uuid) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_team_leader_programs"(p_participant_id uuid) FROM "service_role";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_team_leader_programs"(p_participant_id uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_team_leader_programs"(p_participant_id uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_team_leader_programs"(p_participant_id uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_team_leader_programs"(p_participant_id uuid) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."team_leader_create_general_entry"(p_item_id uuid, p_participant_ids uuid[]) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."team_leader_create_general_entry"(p_item_id uuid, p_participant_ids uuid[]) FROM "anon";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."team_leader_create_general_entry"(p_item_id uuid, p_participant_ids uuid[]) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."team_leader_create_general_entry"(p_item_id uuid, p_participant_ids uuid[]) FROM "service_role";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."team_leader_create_general_entry"(p_item_id uuid, p_participant_ids uuid[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."team_leader_create_general_entry"(p_item_id uuid, p_participant_ids uuid[]) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."team_leader_create_general_entry"(p_item_id uuid, p_participant_ids uuid[]) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."team_leader_create_general_entry"(p_item_id uuid, p_participant_ids uuid[]) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."team_leader_assign_program"(p_participant_id uuid, p_item_id uuid) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."team_leader_assign_program"(p_participant_id uuid, p_item_id uuid) FROM "anon";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."team_leader_assign_program"(p_participant_id uuid, p_item_id uuid) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."team_leader_assign_program"(p_participant_id uuid, p_item_id uuid) FROM "service_role";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."team_leader_assign_program"(p_participant_id uuid, p_item_id uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."team_leader_assign_program"(p_participant_id uuid, p_item_id uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."team_leader_assign_program"(p_participant_id uuid, p_item_id uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."team_leader_assign_program"(p_participant_id uuid, p_item_id uuid) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."resolve_team_leader_login_email"(p_username text) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."resolve_team_leader_login_email"(p_username text) FROM "anon";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."resolve_team_leader_login_email"(p_username text) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."resolve_team_leader_login_email"(p_username text) FROM "service_role";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."resolve_team_leader_login_email"(p_username text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."resolve_team_leader_login_email"(p_username text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."resolve_team_leader_login_email"(p_username text) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."update_competition_item"(p_festival_id uuid, p_item_id uuid, p_item_name_ml text, p_category_codes text[], p_group_member_count integer, p_expected_updated_at timestamp with time zone) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."update_competition_item"(p_festival_id uuid, p_item_id uuid, p_item_name_ml text, p_category_codes text[], p_group_member_count integer, p_expected_updated_at timestamp with time zone) FROM "anon";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."update_competition_item"(p_festival_id uuid, p_item_id uuid, p_item_name_ml text, p_category_codes text[], p_group_member_count integer, p_expected_updated_at timestamp with time zone) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."update_competition_item"(p_festival_id uuid, p_item_id uuid, p_item_name_ml text, p_category_codes text[], p_group_member_count integer, p_expected_updated_at timestamp with time zone) FROM "service_role";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."update_competition_item"(p_festival_id uuid, p_item_id uuid, p_item_name_ml text, p_category_codes text[], p_group_member_count integer, p_expected_updated_at timestamp with time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."update_competition_item"(p_festival_id uuid, p_item_id uuid, p_item_name_ml text, p_category_codes text[], p_group_member_count integer, p_expected_updated_at timestamp with time zone) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."update_competition_item"(p_festival_id uuid, p_item_id uuid, p_item_name_ml text, p_category_codes text[], p_group_member_count integer, p_expected_updated_at timestamp with time zone) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."update_competition_item"(p_festival_id uuid, p_item_id uuid, p_item_name_ml text, p_category_codes text[], p_group_member_count integer, p_expected_updated_at timestamp with time zone) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."assert_festival_chest_admin"(p_festival_id uuid) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."assert_festival_chest_admin"(p_festival_id uuid) FROM "anon";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."assert_festival_chest_admin"(p_festival_id uuid) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."assert_festival_chest_admin"(p_festival_id uuid) FROM "service_role";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."assert_festival_chest_admin"(p_festival_id uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."assert_festival_chest_admin"(p_festival_id uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."assert_festival_chest_admin"(p_festival_id uuid) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."guard_final_chest_numbers"() FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."guard_final_chest_numbers"() FROM "anon";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."guard_final_chest_numbers"() FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."guard_final_chest_numbers"() FROM "service_role";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."guard_final_chest_numbers"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."guard_final_chest_numbers"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."guard_final_chest_numbers"() TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_festival_chest_order"(p_festival_id uuid) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_festival_chest_order"(p_festival_id uuid) FROM "anon";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_festival_chest_order"(p_festival_id uuid) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_festival_chest_order"(p_festival_id uuid) FROM "service_role";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_festival_chest_order"(p_festival_id uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_festival_chest_order"(p_festival_id uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_festival_chest_order"(p_festival_id uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_festival_chest_order"(p_festival_id uuid) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."save_festival_chest_order"(p_festival_id uuid, p_team_ids uuid[], p_expected_team_ids uuid[], p_expected_revision integer, p_expected_range integer) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."save_festival_chest_order"(p_festival_id uuid, p_team_ids uuid[], p_expected_team_ids uuid[], p_expected_revision integer, p_expected_range integer) FROM "anon";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."save_festival_chest_order"(p_festival_id uuid, p_team_ids uuid[], p_expected_team_ids uuid[], p_expected_revision integer, p_expected_range integer) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."save_festival_chest_order"(p_festival_id uuid, p_team_ids uuid[], p_expected_team_ids uuid[], p_expected_revision integer, p_expected_range integer) FROM "service_role";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."save_festival_chest_order"(p_festival_id uuid, p_team_ids uuid[], p_expected_team_ids uuid[], p_expected_revision integer, p_expected_range integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."save_festival_chest_order"(p_festival_id uuid, p_team_ids uuid[], p_expected_team_ids uuid[], p_expected_revision integer, p_expected_range integer) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."save_festival_chest_order"(p_festival_id uuid, p_team_ids uuid[], p_expected_team_ids uuid[], p_expected_revision integer, p_expected_range integer) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."save_festival_chest_order"(p_festival_id uuid, p_team_ids uuid[], p_expected_team_ids uuid[], p_expected_revision integer, p_expected_range integer) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."set_festival_chest_lock"(p_festival_id uuid, p_locked boolean, p_expected_revision integer, p_expected_team_ids uuid[], p_expected_range integer, p_unlock_code text) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."set_festival_chest_lock"(p_festival_id uuid, p_locked boolean, p_expected_revision integer, p_expected_team_ids uuid[], p_expected_range integer, p_unlock_code text) FROM "anon";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."set_festival_chest_lock"(p_festival_id uuid, p_locked boolean, p_expected_revision integer, p_expected_team_ids uuid[], p_expected_range integer, p_unlock_code text) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."set_festival_chest_lock"(p_festival_id uuid, p_locked boolean, p_expected_revision integer, p_expected_team_ids uuid[], p_expected_range integer, p_unlock_code text) FROM "service_role";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."set_festival_chest_lock"(p_festival_id uuid, p_locked boolean, p_expected_revision integer, p_expected_team_ids uuid[], p_expected_range integer, p_unlock_code text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_festival_chest_lock"(p_festival_id uuid, p_locked boolean, p_expected_revision integer, p_expected_team_ids uuid[], p_expected_range integer, p_unlock_code text) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."set_festival_chest_lock"(p_festival_id uuid, p_locked boolean, p_expected_revision integer, p_expected_team_ids uuid[], p_expected_range integer, p_unlock_code text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_festival_chest_lock"(p_festival_id uuid, p_locked boolean, p_expected_revision integer, p_expected_team_ids uuid[], p_expected_range integer, p_unlock_code text) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."update_general_team_roster"(p_registration_id uuid, p_participant_ids uuid[], p_expected_participant_ids uuid[]) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."update_general_team_roster"(p_registration_id uuid, p_participant_ids uuid[], p_expected_participant_ids uuid[]) FROM "anon";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."update_general_team_roster"(p_registration_id uuid, p_participant_ids uuid[], p_expected_participant_ids uuid[]) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."update_general_team_roster"(p_registration_id uuid, p_participant_ids uuid[], p_expected_participant_ids uuid[]) FROM "service_role";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."update_general_team_roster"(p_registration_id uuid, p_participant_ids uuid[], p_expected_participant_ids uuid[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."update_general_team_roster"(p_registration_id uuid, p_participant_ids uuid[], p_expected_participant_ids uuid[]) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."update_general_team_roster"(p_registration_id uuid, p_participant_ids uuid[], p_expected_participant_ids uuid[]) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."update_general_team_roster"(p_registration_id uuid, p_participant_ids uuid[], p_expected_participant_ids uuid[]) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."update_group_team_roster"(p_registration_id uuid, p_participant_ids uuid[], p_expected_participant_ids uuid[], p_leader_participant_id uuid, p_expected_leader_participant_id uuid) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."update_group_team_roster"(p_registration_id uuid, p_participant_ids uuid[], p_expected_participant_ids uuid[], p_leader_participant_id uuid, p_expected_leader_participant_id uuid) FROM "anon";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."update_group_team_roster"(p_registration_id uuid, p_participant_ids uuid[], p_expected_participant_ids uuid[], p_leader_participant_id uuid, p_expected_leader_participant_id uuid) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."update_group_team_roster"(p_registration_id uuid, p_participant_ids uuid[], p_expected_participant_ids uuid[], p_leader_participant_id uuid, p_expected_leader_participant_id uuid) FROM "service_role";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."update_group_team_roster"(p_registration_id uuid, p_participant_ids uuid[], p_expected_participant_ids uuid[], p_leader_participant_id uuid, p_expected_leader_participant_id uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."update_group_team_roster"(p_registration_id uuid, p_participant_ids uuid[], p_expected_participant_ids uuid[], p_leader_participant_id uuid, p_expected_leader_participant_id uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."update_group_team_roster"(p_registration_id uuid, p_participant_ids uuid[], p_expected_participant_ids uuid[], p_leader_participant_id uuid, p_expected_leader_participant_id uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."update_group_team_roster"(p_registration_id uuid, p_participant_ids uuid[], p_expected_participant_ids uuid[], p_leader_participant_id uuid, p_expected_leader_participant_id uuid) TO "service_role";

NOTIFY pgrst, 'reload schema';
COMMIT;
