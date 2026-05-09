-- Re-affirm RPC grants and refresh PostgREST schema cache once commit_restricted_zone exists.
-- If you still see “Could not find the function … in the schema cache”, apply 0011_commit_restricted_zone.sql
-- first (Dashboard → SQL → paste/run that migration), then rerun pending migrations.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'commit_restricted_zone'
      AND pg_get_function_identity_arguments(p.oid) = 'text, jsonb, uuid, jsonb'
  ) THEN
    EXECUTE $g$
      GRANT EXECUTE ON FUNCTION public.commit_restricted_zone(text, jsonb, uuid, jsonb)
        TO authenticated, service_role
    $g$;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
