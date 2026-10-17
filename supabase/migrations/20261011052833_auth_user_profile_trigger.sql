-- The source project has this custom trigger on the Supabase-managed auth.users table.
-- It is excluded from the public-schema dump and must be recreated separately.
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
