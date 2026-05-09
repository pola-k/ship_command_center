-- Authoritative restricted zone commit: union + clip to scenario navigable water,
-- breaches, route invalidation, reroute/stranded signaling.
-- SECURITY DEFINER; role check profiles.role = 'command'.

CREATE OR REPLACE FUNCTION public.commit_restricted_zone(
  p_name text,
  p_cell_polygons jsonb,
  p_scenario_id uuid DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  p_properties jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role public.app_role;
  v_nav geography;
  v_union_geom geometry;
  v_clip_geom geometry;
  v_zone_geog geography;
  v_zone_id uuid;
  v_area_m2 double precision;
  route_path record;
  v_path_len double precision;
  v_ix_len double precision;
  v_ratio double precision;
  v_breach_ids text[];
  v_reroute_ids text[];
  v_stranded_ids text[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT p.role INTO v_role FROM public.profiles p WHERE p.user_id = v_uid;
  IF v_role IS DISTINCT FROM 'command' THEN
    RAISE EXCEPTION 'forbidden: command role required';
  END IF;

  IF p_name IS NULL OR BTRIM(p_name) = '' THEN
    RAISE EXCEPTION 'name required';
  END IF;

  IF p_cell_polygons IS NULL OR jsonb_array_length(p_cell_polygons) = 0 THEN
    RAISE EXCEPTION 'no cells';
  END IF;

  SELECT s.navigable_water INTO v_nav
  FROM public.scenarios s
  WHERE s.id = p_scenario_id;

  IF v_nav IS NULL THEN
    RAISE EXCEPTION 'scenario not found';
  END IF;

  SELECT ST_UnaryUnion(ST_Collect(g))
  INTO v_union_geom
  FROM (
    SELECT ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(elem::text), 4326)) AS g
    FROM jsonb_array_elements(p_cell_polygons) AS elem
  ) q;

  IF v_union_geom IS NULL OR ST_IsEmpty(v_union_geom) THEN
    RAISE EXCEPTION 'invalid geometry';
  END IF;

  v_clip_geom := ST_MakeValid(
    ST_Intersection(ST_MakeValid(v_union_geom), ST_MakeValid(v_nav::geometry))
  );

  IF v_clip_geom IS NULL OR ST_IsEmpty(v_clip_geom) THEN
    RAISE EXCEPTION 'zone outside navigable water';
  END IF;

  SELECT geom
  INTO v_clip_geom
  FROM ST_Dump(ST_CollectionExtract(v_clip_geom, 3)) AS d
  ORDER BY ST_Area((geom)::geography) DESC NULLS LAST
  LIMIT 1;

  IF v_clip_geom IS NULL OR ST_IsEmpty(v_clip_geom) THEN
    RAISE EXCEPTION 'no polygon after clip';
  END IF;

  v_zone_geog := v_clip_geom::geography;
  v_area_m2 := ST_Area(v_zone_geog);

  IF v_area_m2 < 1000 THEN
    RAISE EXCEPTION 'zone too small';
  END IF;

  INSERT INTO public.restricted_zones (name, created_by, polygon, is_active, properties)
  VALUES (
    BTRIM(p_name),
    v_uid,
    v_zone_geog,
    true,
    COALESCE(p_properties, '{}'::jsonb)
      || jsonb_build_object(
        'source', 'zone_architect',
        'cell_count', jsonb_array_length(p_cell_polygons),
        'scenario_id', p_scenario_id::text
      )
  )
  RETURNING id INTO v_zone_id;

  INSERT INTO public.alerts (
    ship_id,
    type,
    severity,
    title,
    description,
    status,
    source,
    related_zone_id,
    related_ship_id,
    payload
  )
  SELECT
    s.ship_id,
    'geofence_breach'::public.alert_type,
    5,
    'Geofence breach',
    format('Ship %s is inside restricted zone %s.', s.ship_id, BTRIM(p_name)),
    'active'::public.alert_status,
    'ZONE_COMMIT',
    v_zone_id,
    s.ship_id,
    jsonb_build_object('zone_id', v_zone_id, 'zone_name', BTRIM(p_name))
  FROM public.ship_state_current s
  WHERE ST_Covers(v_zone_geog, s.position);

  SELECT COALESCE(array_agg(s.ship_id), ARRAY[]::text[])
  INTO v_breach_ids
  FROM public.ship_state_current s
  WHERE ST_Covers(v_zone_geog, s.position);

  UPDATE public.ship_state_current s
  SET status = 'distressed'::public.ship_status
  WHERE ST_Covers(v_zone_geog, s.position);

  WITH latest AS (
    SELECT DISTINCT ON (ship_id) id AS route_id, ship_id, path_line
    FROM public.routes
    ORDER BY ship_id, created_at DESC
  ),
  hit AS (
    SELECT l.route_id, l.ship_id
    FROM latest l
    WHERE ST_Intersects(l.path_line::geometry, v_clip_geom)
  )
  UPDATE public.routes rt
  SET is_valid = false,
      invalid_reason = 'restricted_zone_overlap'
  FROM hit h
  WHERE rt.id = h.route_id;

  WITH latest AS (
    SELECT DISTINCT ON (ship_id) id AS route_id, ship_id, path_line
    FROM public.routes
    ORDER BY ship_id, created_at DESC
  ),
  hit AS (
    SELECT l.route_id, l.ship_id
    FROM latest l
    WHERE ST_Intersects(l.path_line::geometry, v_clip_geom)
  )
  SELECT COALESCE(array_agg(DISTINCT ship_id), ARRAY[]::text[])
  INTO v_reroute_ids
  FROM hit;

  UPDATE public.ship_state_current s
  SET status = 'rerouting'::public.ship_status
  WHERE s.ship_id = ANY (v_reroute_ids)
    AND s.status IS DISTINCT FROM 'distressed'::public.ship_status;

  INSERT INTO public.alerts (
    ship_id,
    type,
    severity,
    title,
    description,
    status,
    source,
    related_zone_id,
    related_ship_id,
    payload
  )
  SELECT
    s.ship_id,
    'stranded'::public.alert_type,
    5,
    'Destination blocked by restricted zone',
    format('Ship %s destination lies inside %s.', s.ship_id, BTRIM(p_name)),
    'active'::public.alert_status,
    'ZONE_COMMIT',
    v_zone_id,
    s.ship_id,
    jsonb_build_object('zone_id', v_zone_id, 'reason', 'destination_in_zone')
  FROM public.ships sh
  JOIN public.ports po ON po.id = sh.destination_port_id
  JOIN public.ship_state_current s ON s.ship_id = sh.id
  WHERE ST_Covers(v_zone_geog, po.position)
    AND s.status IS DISTINCT FROM 'distressed'::public.ship_status
    AND NOT EXISTS (
      SELECT 1
      FROM public.alerts a
      WHERE a.ship_id = s.ship_id
        AND a.related_zone_id = v_zone_id
        AND a.status = 'active'
        AND a.type = 'stranded'::public.alert_type
    );

  UPDATE public.ship_state_current s
  SET status = 'stranded'::public.ship_status
  FROM public.ships sh
  JOIN public.ports po ON po.id = sh.destination_port_id
  WHERE sh.id = s.ship_id
    AND ST_Covers(v_zone_geog, po.position)
    AND s.status IS DISTINCT FROM 'distressed'::public.ship_status;

  SELECT COALESCE(array_agg(DISTINCT s.ship_id), ARRAY[]::text[])
  INTO v_stranded_ids
  FROM public.ships sh
  JOIN public.ports po ON po.id = sh.destination_port_id
  JOIN public.ship_state_current s ON s.ship_id = sh.id
  WHERE ST_Covers(v_zone_geog, po.position)
    AND s.status IS DISTINCT FROM 'distressed'::public.ship_status;

  FOR route_path IN
    WITH latest AS (
      SELECT DISTINCT ON (ship_id) ship_id, path_line
      FROM public.routes
      ORDER BY ship_id, created_at DESC
    )
    SELECT l.ship_id, l.path_line
    FROM latest l
    WHERE ST_Intersects(l.path_line::geometry, v_clip_geom)
  LOOP
    IF ST_Covers(
      v_zone_geog,
      (SELECT ss.position FROM public.ship_state_current ss WHERE ss.ship_id = route_path.ship_id)
    ) THEN
      CONTINUE;
    END IF;

    v_path_len := ST_Length(route_path.path_line::geography);

    BEGIN
      v_ix_len :=
        ST_Length(
          COALESCE(ST_Intersection(ST_MakeValid(route_path.path_line::geometry), v_clip_geom), ST_GeomFromText('LINESTRING EMPTY', 4326))::geography
        );
    EXCEPTION
      WHEN others THEN v_ix_len := 0;
    END;

    IF v_path_len IS NULL OR v_path_len <= 0 THEN CONTINUE; END IF;

    v_ratio := v_ix_len / v_path_len;

    IF v_ratio > 0.35 THEN
      IF NOT EXISTS (
        SELECT 1
        FROM public.alerts ax
        WHERE ax.ship_id = route_path.ship_id
          AND ax.related_zone_id = v_zone_id
          AND ax.status = 'active'
          AND ax.type IN ('stranded'::public.alert_type, 'geofence_breach'::public.alert_type)
      ) THEN
        INSERT INTO public.alerts (
          ship_id, type, severity, title, description, status, source, related_zone_id, related_ship_id, payload
        )
        VALUES (
          route_path.ship_id,
          'stranded'::public.alert_type,
          4,
          'Route obstructed',
          format('Computed path for %s is heavily intersected by %s (~%s%%). Phase-A reroute heuristic.',
            route_path.ship_id,
            BTRIM(p_name),
            round((v_ratio * 100)::numeric, 0)),
          'active'::public.alert_status,
          'ZONE_COMMIT',
          v_zone_id,
          route_path.ship_id,
          jsonb_build_object('zone_id', v_zone_id, 'overlap_ratio', v_ratio, 'phase', 'A')
        );
      END IF;

      UPDATE public.ship_state_current s
      SET status = 'stranded'::public.ship_status
      WHERE s.ship_id = route_path.ship_id
        AND s.status IS DISTINCT FROM 'distressed'::public.ship_status;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'zone_id', v_zone_id,
    'breach_ship_ids', to_jsonb(COALESCE(v_breach_ids, ARRAY[]::text[])),
    'reroute_ship_ids', to_jsonb(COALESCE(v_reroute_ids, ARRAY[]::text[])),
    'stranded_ship_ids', to_jsonb(COALESCE(v_stranded_ids, ARRAY[]::text[]))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.commit_restricted_zone(text, jsonb, uuid, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.commit_restricted_zone(text, jsonb, uuid, jsonb)
  TO authenticated;

-- Realtime: include routes updates for tactical path overlays
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      EXECUTE 'alter publication supabase_realtime add table public.routes';
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN others THEN NULL;
    END;
  END IF;
END $$;
