-- The existing Stage data tables already have RLS. Protect the two private
-- configuration tables added for the reversible Stage v2/Dashboard switches.
-- Their SECURITY DEFINER readers retain existing ownership-based access.
ALTER TABLE stage_portal_private.stage_read_modes ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_portal_private.application_feature_flags ENABLE ROW LEVEL SECURITY;
