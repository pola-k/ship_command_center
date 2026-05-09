-- Command-only: hide a committed zone from the map (logical delete via is_active).
CREATE OR REPLACE FUNCTION public.deactivate_restricted_zone(p_zone_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role public.app_role;
  v_rows int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT p.role INTO v_role FROM public.profiles p WHERE p.user_id = v_uid;
  IF v_role IS DISTINCT FROM 'command' THEN
    RAISE EXCEPTION 'forbidden: command role required';
  END IF;

  IF p_zone_id IS NULL THEN
    RAISE EXCEPTION 'zone id required';
  END IF;

  UPDATE public.restricted_zones
  SET is_active = false,
      updated_at = now()
  WHERE id = p_zone_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'zone not found';
  END IF;

  RETURN jsonb_build_object('ok', true, 'zone_id', p_zone_id::text);
END;
$$;

REVOKE ALL ON FUNCTION public.deactivate_restricted_zone(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.deactivate_restricted_zone(uuid)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
